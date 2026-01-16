import { TRequest, TFetchDataOption } from "../types/requestType";

export const fetchDataForFE = async (uri: string, options: Partial<TRequest> = {}): Promise<any> => {
  try {
    let url = uri;
    const fetchOption: RequestInit = {};
    if (options.method) {
      fetchOption.method = options.method
    }
    if (options.headers) {
      fetchOption.headers = options.headers as HeadersInit
    }
    if (options.body) {
      fetchOption.body = options.body as BodyInit
    }
    if (options.query) {
      const query = Object.keys(options.query).reduce((curQuery, key) => {
        const value = options.query?.[key];
        if (!curQuery.includes("?")) {
          return `${curQuery}?${key}=${value}`;
        }
        return `${curQuery}&${key}=${value}`;
      },
      "");
      url = url + query;
    }
    if (options.param) {
      url = Object.keys(options.param).reduce(
        (text, key) => {
          const value = options.param?.[key] ?? "";
          return text.replace(new RegExp(`{:${key}}`, "g"), value);
        },
        url
      ); 
    }
    const result = await fetch(url, fetchOption);

    return result.json();
    return {};
  } catch (e) {
    throw e;
  }
};

export const fetchDataForAPI = async (uri: string, fetchDataOption: TFetchDataOption): Promise<any> => {
  try {
    let url = uri;
    const { options = {}, disableSerialization = false, isEmulateBrowser = false } = fetchDataOption
    const fetchOption: RequestInit = {};
    if (options.method) {
      fetchOption.method = options.method
    }
    if (options.headers) {
      fetchOption.headers = options.headers as HeadersInit
    }
    if (isEmulateBrowser) {
      fetchOption.headers = {
        ...fetchOption.headers,
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
      }
    }
    if (options.body) {
      fetchOption.body = options.body as BodyInit
    }
    if (options.query) {
      const query = Object.keys(options.query).reduce((curQuery, key) => {
        const value = options.query?.[key];
        if (!curQuery.includes("?")) {
          return `${curQuery}?${key}=${value}`;
        }
        return `${curQuery}&${key}=${value}`;
      },
      "");
      url = url + query;
    }
    if (options.param) {
      url = Object.keys(options.param).reduce(
        (text, key) => {
          const value = options.param?.[key] ?? "";
          return text.replace(new RegExp(`{:${key}}`, "g"), value);
        },
        url
      ); 
    }
    const result = await fetch(url, fetchOption);

    if (disableSerialization) {
      return result.text();
    }
    return result.json();
  } catch (e) {
    throw e;
  }
};