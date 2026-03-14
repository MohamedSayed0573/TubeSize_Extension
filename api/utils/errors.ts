export class AppError extends Error {
    public statusCode: number;
    constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;
    }
}

export class InvalidInputError extends AppError {
    constructor(message: string) {
        super(message, 400);
    }
}

export class RateLimitError extends AppError {
    constructor(message: string) {
        super(message, 429);
    }
}

export class NotFoundError extends AppError {
    constructor(message: string) {
        super(message, 404);
    }
}
