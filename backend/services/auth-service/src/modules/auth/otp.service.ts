import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../../libs/database/prisma.service';
import * as crypto from 'crypto';
import nodemailer, { Transporter } from 'nodemailer';

@Injectable()
export class OtpService {
  private transporter?: Transporter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  // Tạo và gửi OTP 6 chữ số có hiệu lực 60 giây
  async sendOtp(email: string): Promise<{
    success: boolean;
    expiresIn: number;
  }> {
    const otpTtlSeconds = Number(this.configService.get('OTP_TTL_SECONDS') ?? 300);
    const otp = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
    const expiresAt = new Date(Date.now() + otpTtlSeconds * 1000);

    await this.prisma.otpCode.deleteMany({ where: { email } });
    await this.prisma.otpCode.create({
      data: {
        email,
        code: otp,
        expiresAt,
      },
    });

    await this.sendOtpEmail(email, otp, otpTtlSeconds);

    const response: { success: boolean; expiresIn: number } = {
      success: true,
      expiresIn: otpTtlSeconds,
    };

    return response;
  }

  private getTransporter(): Transporter {
    if (this.transporter) {
      return this.transporter;
    }

    const host = this.getEnv('SMTP_HOST', 'MAIL_HOST');
    const port = Number(this.getEnv('SMTP_PORT', 'MAIL_PORT') ?? 587);
    const user = this.getEnv('SMTP_USER', 'MAIL_USER');
    const pass = this.getEnv('SMTP_PASS', 'MAIL_PASS');
    const secure =
      this.getEnv('SMTP_SECURE', 'MAIL_SECURE') === 'true' || port === 465;

    if (!host || !user || !pass) {
      throw new InternalServerErrorException(
        'Mail service chưa được cấu hình. Thiếu SMTP_* hoặc MAIL_*',
      );
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    return this.transporter;
  }

  private async sendOtpEmail(
    email: string,
    otp: string,
    otpTtlSeconds: number,
  ): Promise<void> {
    const transporter = this.getTransporter();
    const from =
      this.getEnv('SMTP_FROM', 'MAIL_FROM') ??
      this.getEnv('SMTP_USER', 'MAIL_USER');

    try {
      await transporter.sendMail({
        from,
        to: email,
        subject: 'Mã xác thực OTP',
        text: `Mã OTP của bạn là ${otp}. Mã có hiệu lực trong ${otpTtlSeconds} giây.`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6">
                 <h2>Mã xác thực OTP</h2>
                 <p>Mã OTP của bạn là: <strong style="font-size:24px;letter-spacing:4px">${otp}</strong></p>
                 <p>Mã có hiệu lực trong <strong>${otpTtlSeconds} giây</strong>.</p>
               </div>`,
      });
    } catch {
      throw new InternalServerErrorException('Gửi email OTP thất bại');
    }
  }

  private getEnv(primary: string, fallback?: string): string | undefined {
    const primaryValue = this.configService.get<string>(primary);
    if (primaryValue && primaryValue.trim().length > 0) {
      return primaryValue;
    }

    if (!fallback) {
      return undefined;
    }

    const fallbackValue = this.configService.get<string>(fallback);
    return fallbackValue && fallbackValue.trim().length > 0
      ? fallbackValue
      : undefined;
  }

  // Kiểm tra OTP đúng và còn hạn.
  async verifyOtp(email: string, otp: string): Promise<{ success: boolean }> {
    await this.consumeOtp(email, otp);
    return { success: true };
  }

  async consumeOtp(email: string, otp: string): Promise<void> {
    const otpRecord = await this.prisma.otpCode.findFirst({
      where: { email, code: otp },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new BadRequestException('OTP không hợp lệ');
    }

    if (otpRecord.expiresAt < new Date()) {
      await this.prisma.otpCode.delete({ where: { id: otpRecord.id } });
      throw new BadRequestException('OTP đã hết hạn');
    }

    await this.prisma.otpCode.delete({ where: { id: otpRecord.id } });
  }

}