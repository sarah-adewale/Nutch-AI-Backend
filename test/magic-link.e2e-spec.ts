import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import {
  MailerService,
  MagicLinkEmail,
} from './../src/auth/magic-link/mailer.service';
import { PrismaService } from './../src/database/prisma.service';

/**
 * Exercises the passwordless sign-in round trip over HTTP. Needs a running
 * database, so it lives with the e2e suite rather than the unit tests.
 */
describe('Magic link sign-in (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sent: MagicLinkEmail[] = [];
  const email = `magic+${Date.now()}@example.com`;

  const tokenFromLastEmail = () =>
    new URL(sent[sent.length - 1].link).searchParams.get('token')!;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Capture the link rather than logging it.
      .overrideProvider(MailerService)
      .useValue({
        send: async (message: MagicLinkEmail) => {
          sent.push(message);
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('accepts a request and sends a link', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/magic-link')
      .send({ email })
      .expect(202);

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(email);
  });

  it('exchanges the token for a usable session', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/magic-link/verify')
      .send({ token: tokenFromLastEmail() })
      .expect(201);

    expect(res.body.access_token).toBeDefined();
    expect(res.body.user.email).toBe(email);

    // The returned token must actually authenticate.
    const profile = await request(app.getHttpServer())
      .get('/api/v1/users/profile')
      .set('Authorization', `Bearer ${res.body.access_token}`)
      .expect(200);

    expect(profile.body.isAnonymous).toBe(false);
    expect(profile.body.limits.maxChatSessions).toBe(-1);
  });

  it('refuses to reuse a token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/magic-link/verify')
      .send({ token: tokenFromLastEmail() })
      .expect(400);
  });

  it('signs in to the same account on a second link', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/magic-link')
      .send({ email })
      .expect(202);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/magic-link/verify')
      .send({ token: tokenFromLastEmail() })
      .expect(201);

    const users = await prisma.user.findMany({ where: { email } });
    expect(users).toHaveLength(1);
    expect(res.body.user.id).toBe(users[0].id);
  });

  it('does not reveal whether an address has an account', async () => {
    // Same 202 either way, so the endpoint cannot enumerate users.
    await request(app.getHttpServer())
      .post('/api/v1/auth/magic-link')
      .send({ email: `nobody+${Date.now()}@example.com` })
      .expect(202);
  });
});
