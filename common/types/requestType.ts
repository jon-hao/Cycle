import { IncomingHttpHeaders } from "http";
import { HttpMethod } from "../constants/httpEnum";

export type TQuery = Record<string, any>;

export type TParam = Record<string, string>;

export type THeaders = IncomingHttpHeaders;

export type TBody= Record<string, any>;

export type TRequest = {
  method?: HttpMethod;
  query: TQuery;  // http://abc/?query={query}
  param: TParam; // http://abc/{param}/detail
  body: TBody;
  headers: THeaders;
};

export type TFetchDataOption = {
  options?: Partial<TRequest>
  disableSerialization?: boolean
  isEmulateBrowser?: boolean
}
