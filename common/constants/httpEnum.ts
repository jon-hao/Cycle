export enum HttpMethod {
  Get = "get",
  Post = "post",
  Put = "put",
  Delete = "delete",
  Option = "option",
  Patch = "patch"
}

export enum HttpStatusCode {
  Success = 200,
  NotFound = 404,
  InternalServerError = 500
}

export enum HttpStatusText {
  Success = "Success",
  NotFound = "Path Not Found",
  InternalServerError = "Internal Server Error"
}

export enum EncodeType {
  Gbk = "gbk",
  UTF8 = "utf-8"
}
