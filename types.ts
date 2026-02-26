export type APIData = {
  id: string;
  title: string;
  duration: string;
  audioFormat: string;
  videoFormats: {
    formatId: string;
    height: number;
    size: string;
  }[];
  createdAt?: string;
};

export type RawFormat = {
  id: string;
  title: string;
  author: string;
  duration: string;
  formats: {
    formatId: string;
    height: string;
    size: number | string;
  }[];
  audioFormats: {
    formatId: string;
    size: number;
  }[];
};

export type HumanizedFormat = {
  id: string;
  title: string;
  author: string;
  duration: string;
  videoFormats: {
    formatId: string;
    height: string;
    size: string;
  }[];
  createdAt?: string;
};

export type StorageData = {
  response: APIData | HumanizedFormat;
  expiry?: number;
};

export type ApiResponse = {
  success: boolean;
  data: APIData | HumanizedFormat;
  cached: boolean;
  message?: string;
  api?: boolean;
};
