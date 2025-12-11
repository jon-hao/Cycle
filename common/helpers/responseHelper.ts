import { HttpStatusCode, HttpStatusText } from "../constants/httpEnum";
import { TBody } from "../types/httpType";
import { TErrorResponse, TSuccessResponse } from "../types/responseType";

export const processSuccessResponse = (body: TBody): TSuccessResponse => {
  return {
    status: HttpStatusCode.Success,
    body
  };
}

const errorResponseList = [
  {
    status: HttpStatusCode.NotFound,
    body: {
      error: HttpStatusText.NotFound
    },
  },
  {
    status: HttpStatusCode.InternalServerError,
    body: {
      error: HttpStatusText.InternalServerError
    },
  }
]

export const processErrorResponse = (status: HttpStatusCode): TErrorResponse => {
  const errorResponse = errorResponseList.find(errorResponse => errorResponse.status === status);
  if (!errorResponse) {
    return {
      status: HttpStatusCode.InternalServerError,
      body: {
        error: HttpStatusText.InternalServerError
      },
    };
  }
  return errorResponse;
}
