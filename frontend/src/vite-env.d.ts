/// <reference types="vite/client" />

interface Window {
  WebApp?: {
    initData: string;
    initDataUnsafe?: { start_param?: string };
    platform?: string;
    version?: string;
  };
}

