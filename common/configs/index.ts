import { Domain, Platform } from "../constants/serviceEnum";
import { TConfig, TConfigHttp } from "../types/configType";
import dataConfig from "./dataConfig";

const config: TConfig = {
  [Domain.Data]: dataConfig,
}

const getConfig = (domain: Domain, platform: Platform): TConfigHttp => {
  return config?.[domain]?.[platform] as TConfigHttp
}

export default getConfig;