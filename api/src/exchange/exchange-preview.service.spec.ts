import { HttpException, HttpStatus } from '@nestjs/common'
import sharp from 'sharp'
import { ExchangePreviewService } from './exchange-preview.service'

const mockGetScreenshot = jest.fn()
const mockGetText = jest.fn()
const mockDestroy = jest.fn()

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getScreenshot: mockGetScreenshot,
    getText: mockGetText,
    destroy: mockDestroy,
  })),
}))

function createFile(buffer: Buffer, originalname = 'sample.bin'): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype: 'application/octet-stream',
    size: buffer.length,
    buffer,
  } as Express.Multer.File
}

async function createSamplePng(width = 160, height = 120): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 20, g: 120, b: 80 },
    },
  })
    .png()
    .toBuffer()
}

describe('ExchangePreviewService', () => {
  const service = new ExchangePreviewService()
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    mockGetScreenshot.mockReset()
    mockGetText.mockReset()
    mockDestroy.mockReset().mockResolvedValue(undefined)
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('generates a blurred webp preview for raster images', async () => {
    const png = await createSamplePng()
    const preview = await service.generatePreview(
      createFile(png, 'photo.png'),
      { mime: 'image/png', ext: 'png' },
      'photo.png',
    )

    expect(preview.meta.format).toBe('webp')
    expect(preview.meta.sourceKind).toBe('image')
    expect(preview.meta.width).toBeGreaterThan(0)
    expect(preview.meta.height).toBeGreaterThan(0)
    expect(preview.bytes.length).toBeGreaterThan(0)
  })

  it('generates a document preview card for plain text and empty text files', async () => {
    const longText = [
      'Confidential <Report> & "Numbers": 12345 €',
      '',
      '',
      'a'.repeat(80),
      ...Array.from({ length: 12 }, (_, idx) => `Paragraph line ${idx + 1} with extra text.`),
    ].join('\r\n')

    const textPreview = await service.generatePreview(
      createFile(Buffer.from(longText, 'utf8'), 'report.txt'),
      { mime: 'text/plain', ext: 'txt' },
      'report.txt',
    )
    expect(textPreview.meta.format).toBe('webp')
    expect(textPreview.meta.sourceKind).toBe('document')
    expect(textPreview.bytes.length).toBeGreaterThan(0)

    const emptyPreview = await service.generatePreview(
      createFile(Buffer.from('   ', 'utf8'), 'empty.txt'),
      { mime: 'text/plain', ext: 'txt' },
      'empty.txt',
    )
    expect(emptyPreview.meta.sourceKind).toBe('document')
    expect(emptyPreview.bytes.length).toBeGreaterThan(0)
  })

  it('renders a PDF preview from first-page screenshot when available', async () => {
    const pagePng = await createSamplePng(200, 260)
    mockGetScreenshot.mockResolvedValue({ pages: [{ data: pagePng }] })

    const preview = await service.generatePreview(
      createFile(Buffer.from('%PDF-1.7'), 'contract.pdf'),
      { mime: 'application/pdf', ext: 'pdf' },
      'contract.pdf',
    )

    expect(mockGetScreenshot).toHaveBeenCalledTimes(1)
    expect(mockGetText).not.toHaveBeenCalled()
    expect(mockDestroy).toHaveBeenCalledTimes(1)
    expect(preview.meta.format).toBe('webp')
    expect(preview.meta.sourceKind).toBe('document')
  })

  it('falls back to PDF text extraction and default card when screenshot or text fails', async () => {
    mockGetScreenshot.mockRejectedValue(new Error('canvas missing'))
    mockGetText.mockResolvedValue({ text: 'First page summary 2026' })

    const textFallback = await service.generatePreview(
      createFile(Buffer.from('%PDF-1.7'), 'doc.pdf'),
      { mime: 'application/pdf', ext: 'pdf' },
      'doc.pdf',
    )
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(textFallback.meta.sourceKind).toBe('document')

    mockGetScreenshot.mockResolvedValue({ pages: [] })
    mockGetText.mockRejectedValue(new Error('corrupt stream'))

    const emptyFallback = await service.generatePreview(
      createFile(Buffer.from('%PDF-1.7'), 'broken.pdf'),
      { mime: 'application/pdf', ext: 'pdf' },
      'broken.pdf',
    )
    expect(warnSpy).toHaveBeenCalledTimes(2)
    expect(emptyFallback.meta.sourceKind).toBe('document')
  })

  it('rejects unsupported MIME types', async () => {
    await expect(
      service.generatePreview(
        createFile(Buffer.from('data')),
        { mime: 'application/zip' as never, ext: 'txt' },
        'file.zip',
      ),
    ).rejects.toThrow(new HttpException('Unsupported file type', HttpStatus.UNSUPPORTED_MEDIA_TYPE))
  })
})
