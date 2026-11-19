import { HttpException, HttpStatus } from '@nestjs/common'
import { ExchangeFilePolicyService } from './exchange-file-policy.service'

function createFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'note.txt',
    encoding: '7bit',
    mimetype: 'text/plain',
    size: 0,
    buffer: Buffer.from('Hello world', 'utf8'),
    ...overrides,
  } as Express.Multer.File
}

describe('ExchangeFilePolicyService', () => {
  const service = new ExchangeFilePolicyService()

  describe('normalizedFileName', () => {
    it('replaces unsafe characters, limits length and falls back to file', () => {
      expect(service.normalizedFileName('my/bad:file*name?.pdf')).toBe('my_bad_file_name_.pdf')
      expect(service.normalizedFileName('   ')).toBe('file')
      expect(service.normalizedFileName('a'.repeat(250)).length).toBe(180)
    })
  })

  describe('detectValidatedMime', () => {
    it('detects JPEG, PNG, WEBP and PDF from magic bytes', () => {
      const jpeg = createFile({
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
      })
      expect(service.detectValidatedMime(jpeg)).toEqual({ mime: 'image/jpeg', ext: 'jpg' })

      const png = createFile({
        originalname: 'image.png',
        mimetype: 'image/png',
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
      })
      expect(service.detectValidatedMime(png)).toEqual({ mime: 'image/png', ext: 'png' })

      const webpBuffer = Buffer.alloc(16)
      webpBuffer.write('RIFF', 0, 'ascii')
      webpBuffer.write('WEBP', 8, 'ascii')
      const webp = createFile({
        originalname: 'pic.webp',
        mimetype: 'image/webp',
        buffer: webpBuffer,
      })
      expect(service.detectValidatedMime(webp)).toEqual({ mime: 'image/webp', ext: 'webp' })

      const pdf = createFile({
        originalname: 'doc.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(' \t\n%PDF-1.7')]),
      })
      expect(service.detectValidatedMime(pdf)).toEqual({ mime: 'application/pdf', ext: 'pdf' })
    })

    it('accepts valid UTF-8 plain text including empty buffers', () => {
      expect(
        service.detectValidatedMime(
          createFile({
            originalname: 'readme',
            mimetype: '',
            buffer: Buffer.from('Just a regular note.\nLine 2.', 'utf8'),
          }),
        ),
      ).toEqual({ mime: 'text/plain', ext: 'txt' })

      expect(
        service.detectValidatedMime(
          createFile({
            originalname: 'empty.txt',
            buffer: Buffer.alloc(0),
          }),
        ),
      ).toEqual({ mime: 'text/plain', ext: 'txt' })
    })

    it('rejects blocked extensions and blocked claimed MIME types', () => {
      for (const name of ['payload.json', 'dump.sql', 'script.sh', 'archive.zip', 'app.exe']) {
        expect(() => service.detectValidatedMime(createFile({ originalname: name }))).toThrow(
          new HttpException('File extension not allowed', HttpStatus.UNSUPPORTED_MEDIA_TYPE),
        )
      }

      for (const mimetype of ['application/json', 'audio/mpeg', 'video/mp4', 'application/zip']) {
        expect(() =>
          service.detectValidatedMime(
            createFile({
              originalname: 'innocent.txt',
              mimetype,
              buffer: Buffer.from('plain content', 'utf8'),
            }),
          ),
        ).toThrow(new HttpException('File type not allowed', HttpStatus.UNSUPPORTED_MEDIA_TYPE))
      }

      expect(() =>
        service.detectValidatedMime(
          createFile({
            originalname: 'data.txt',
            mimetype: 'application/ld+json',
            buffer: Buffer.from('hello', 'utf8'),
          }),
        ),
      ).toThrow(
        new HttpException('JSON and SQL files are not allowed', HttpStatus.UNSUPPORTED_MEDIA_TYPE),
      )
    })

    it('rejects unknown binary buffers, invalid UTF-8 and high control-byte content', () => {
      expect(() =>
        service.detectValidatedMime(
          createFile({
            originalname: 'blob.bin',
            buffer: Buffer.from([0x01, 0x00, 0x02, 0x03]),
          }),
        ),
      ).toThrow(
        new HttpException(
          'Unknown binary file type is not allowed',
          HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        ),
      )

      expect(() =>
        service.detectValidatedMime(
          createFile({
            originalname: 'badutf8.bin',
            buffer: Buffer.from([0xff, 0xfe, 0xfd]),
          }),
        ),
      ).toThrow('Unknown binary file type is not allowed')

      expect(() =>
        service.detectValidatedMime(
          createFile({
            originalname: 'controls.bin',
            buffer: Buffer.from([0x01, 0x02, 0x03, 0x04, 0x41]),
          }),
        ),
      ).toThrow('Unknown binary file type is not allowed')
    })

    it('rejects JSON and SQL payloads disguised as plain text', () => {
      const disguisedPayloads = [
        '{"secret": true}',
        '[1, 2, 3]',
        'SELECT * FROM users;',
        '-- migration\nDROP TABLE accounts;',
        'Notes before CREATE TABLE items (id int);',
      ]

      for (const payload of disguisedPayloads) {
        expect(() =>
          service.detectValidatedMime(
            createFile({
              originalname: 'notes.txt',
              mimetype: 'text/plain',
              buffer: Buffer.from(payload, 'utf8'),
            }),
          ),
        ).toThrow(
          new HttpException(
            'JSON and SQL files are not allowed',
            HttpStatus.UNSUPPORTED_MEDIA_TYPE,
          ),
        )
      }

      expect(
        service.detectValidatedMime(
          createFile({
            originalname: 'notes.txt',
            buffer: Buffer.from('{not valid json at all', 'utf8'),
          }),
        ),
      ).toEqual({ mime: 'text/plain', ext: 'txt' })
    })
  })
})
