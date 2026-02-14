export type PreviewMeta = {
  format: 'webp';
  width: number;
  height: number;
  sizeBytes: number;
  sourceKind: 'image' | 'document';
};

export type ValidatedMime = {
  mime:
    | 'image/jpeg'
    | 'image/png'
    | 'image/webp'
    | 'application/pdf'
    | 'text/plain';
  ext: 'jpg' | 'png' | 'webp' | 'pdf' | 'txt';
};

export type GeneratedPreview = {
  bytes: Buffer;
  meta: PreviewMeta;
};
