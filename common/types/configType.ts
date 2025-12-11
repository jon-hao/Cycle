import { Domain, Platform } from "../constants/serviceEnum";

export type TConfigHttp = Record<string, { url: string; }>;

export type TConfigDomain = Partial<Record<Platform, TConfigHttp>>;

export type TConfig = Record<Domain, TConfigDomain>;