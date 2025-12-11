import { HttpMethod } from "../constants/httpEnum";
import { Domain } from "../constants/serviceEnum";

export type TEntry = {
  domain: Domain;
  endpoints: TEndpoint<string>[];
}

export type TEndpoint<T> = {
  path: T;
  method: HttpMethod;
  callback: any;
}

export type TEvent = {
  endpoint: {
    domain: Domain;
    path: string;
    method: HttpMethod;
  };
  payload: TPayload;
}

export type TPayload = Record<string, any>;
