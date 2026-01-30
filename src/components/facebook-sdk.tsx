'use client';

import Script from 'next/script';

export function FacebookSDK() {
  return (
    <Script
      src="https://connect.facebook.net/pt_BR/sdk.js"
      strategy="lazyOnload"
      onLoad={() => {
        if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).FB) {
          const FB = (window as unknown as Record<string, unknown>).FB as {
            init: (opts: Record<string, unknown>) => void;
          };
          FB.init({
            appId: process.env.NEXT_PUBLIC_META_APP_ID,
            cookie: true,
            xfbml: false,
            version: 'v21.0',
          });
        }
      }}
    />
  );
}
