'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ImageIcon } from 'lucide-react';
import { useAccount } from '@/components/creatives/account-context';

interface AdThumbnailProps {
  thumbnailUrl: string | null | undefined;
  adId: string;
  /** Override account id (defaults to selectedAccount from context) */
  adAccountId?: string;
  size?: number;
  className?: string;
}

/**
 * Renders an ad thumbnail with automatic fallback to the proxy endpoint.
 * If the direct URL fails (expired Meta token), retries via /api/meta/thumbnail.
 * If thumbnail_url is null, goes directly to the proxy.
 */
export function AdThumbnail({ thumbnailUrl, adId, adAccountId, size = 32, className = '' }: AdThumbnailProps) {
  const { selectedAccount } = useAccount();
  const accountId = adAccountId || selectedAccount;
  const proxyUrl = accountId
    ? `/api/meta/thumbnail?adAccountId=${encodeURIComponent(accountId)}&adId=${encodeURIComponent(adId)}`
    : '';
  const [src, setSrc] = useState(thumbnailUrl || proxyUrl);
  const [failed, setFailed] = useState(!thumbnailUrl && !proxyUrl);

  if (failed || !src) {
    return (
      <div
        className={`flex items-center justify-center rounded bg-muted shrink-0 ${className}`}
        style={{ width: size, height: size }}
      >
        <ImageIcon className="h-3 w-3 text-muted-foreground" />
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      className={`rounded object-cover shrink-0 ${className}`}
      unoptimized
      onError={() => {
        if (src !== proxyUrl && proxyUrl) {
          // Direct URL failed — try the proxy
          setSrc(proxyUrl);
        } else {
          // Proxy also failed — show placeholder
          setFailed(true);
        }
      }}
    />
  );
}
