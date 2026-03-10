export class ApiError extends Error {
  status: number;
  message: string;
  errors?: Record<string, string> | undefined;

  constructor(status: number, message: string, errors?: Record<string, string>) {
    super(message);

    this.status = status;
    this.message = message;
    this.errors = errors;
  }

  static Unauthorized(message: string, errors?: Record<string, string>) {
    return new ApiError(401, message, errors);
  }

  static BadRequest(message: string, errors?: Record<string, string>) {
    return new ApiError(400, message, errors);
  }

  static NotFound(message: string, errors?: Record<string, string>) {
    return new ApiError(404, message, errors);
  }

  static Internal(message: string, errors?: Record<string, string>) {
    return new ApiError(500, message, errors);
  }
}