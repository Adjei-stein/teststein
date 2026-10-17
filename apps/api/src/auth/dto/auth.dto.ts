import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { NormalizeEmail, Trim } from '../../common/trim';

export class SignupDto {
  @Trim()
  @IsString()
  @Length(1, 100)
  name: string;

  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @Length(10, 200, { message: 'Password must be at least 10 characters.' })
  password: string;

  /** Every account starts with its own organisation. */
  @Trim()
  @IsString()
  @Length(1, 100)
  organizationName: string;
}

export class LoginDto {
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MaxLength(200)
  password: string;
}
