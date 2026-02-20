export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }

  static BadRequest(msg: string) {
    return new ApiError(400, msg);
  }

  static NotFound(msg: string) {
    return new ApiError(404, msg);
  }

  static Internal(msg: string) {
    return new ApiError(500, msg);
  }
}