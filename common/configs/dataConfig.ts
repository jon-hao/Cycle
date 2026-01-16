import { Platform } from "../constants/serviceEnum";
import { TConfigDomain } from "../types/configType";

const config: TConfigDomain = {
  [Platform.CNN]: {
    marketSentiment: {
      url: `${process.env.CNN_HOST}/index/fearandgreed/graphdata`
    }
  },
  [Platform.JinTen]: {
    calendar: {
      url: `${process.env.JIN_TEN_HOST}/get/data?date=2025-08-12&category=cj`
    }
  }
}

export default config;