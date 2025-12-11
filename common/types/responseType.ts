import { HttpStatusCode, HttpStatusText } from "../constants/httpEnum";
import { TBody } from "./httpType";

export type TSuccessResponse = {
  status: HttpStatusCode.Success;
  body: TBody;
}

export type TErrorResponse = {
  status: HttpStatusCode;
  body: {
    error: HttpStatusText
  }
}

export type TNotFoundResponse = {
  status: HttpStatusCode.NotFound;
  body: {
    error: HttpStatusText.NotFound
  }
}

export type TResponse = TSuccessResponse | TErrorResponse;