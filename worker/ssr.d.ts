// Types for the server-rendering bundle built by `npm run build:ssr`.
declare module "../dist-ssr/entry-server.js" {
  export const SSR_BUILD_ID: string;
  export function renderStorefront(location: string, inline: Record<string, unknown>, isMobile: boolean): Promise<string | null>;
}
