export declare class AiResponseDto {
    response: string;
    model_used: string;
    timestamp: string;
    file_type: string;
    folder: string;
}
export declare class RedirectResponseDto {
    redirect: true;
    tool: string;
    reason: string;
    pre_fill: string;
}
