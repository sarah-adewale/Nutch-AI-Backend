import { Strategy } from 'passport-github2';
import { VerifyCallback } from 'passport-oauth2';
import { ConfigService } from '@nestjs/config';
declare const GithubStrategy_base: new (...args: [options: import("passport-github2").StrategyOptionsWithRequest] | [options: import("passport-github2").StrategyOptions]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class GithubStrategy extends GithubStrategy_base {
    constructor(configService: ConfigService);
    validate(accessToken: string, refreshToken: string, profile: any, done: VerifyCallback): Promise<any>;
}
export {};
