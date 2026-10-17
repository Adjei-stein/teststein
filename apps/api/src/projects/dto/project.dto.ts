import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Trim } from '../../common/trim';
import type { AppType } from '../../database/database.types';

export const APP_TYPES: AppType[] = ['web', 'mobile', 'api', 'desktop'];

const lowerEmails = () =>
  Transform(({ value }) =>
    Array.isArray(value) ? [...new Set(value.map(v => (typeof v === 'string' ? v.trim().toLowerCase() : v)))] : value,
  );

/** Shared by create and update; on update every field is optional. */
class ProjectFields {
  @Trim()
  @IsString()
  @Length(1, 120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsIn(APP_TYPES)
  appType: AppType;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601({ strict: true }, { message: 'startDate must be a date (YYYY-MM-DD).' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be a date (YYYY-MM-DD).' })
  startDate?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601({ strict: true }, { message: 'endDate must be a date (YYYY-MM-DD).' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate must be a date (YYYY-MM-DD).' })
  endDate?: string | null;

  /** People who receive run reports. Replaces the whole list when sent. */
  @IsOptional()
  @lowerEmails()
  @IsArray()
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true, message: 'Each stakeholder must be a valid email address.' })
  stakeholders?: string[];
}

export class CreateProjectDto extends ProjectFields {
  /** Short code used in test case ids (SHOP → SHOP-123). Can't be changed later. */
  @Trim()
  @Matches(/^[A-Z][A-Z0-9]{1,9}$/, {
    message: 'key must be 2–10 characters: capital letters and digits, starting with a letter.',
  })
  key: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(APP_TYPES)
  appType?: AppType;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601({ strict: true }, { message: 'startDate must be a date (YYYY-MM-DD).' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be a date (YYYY-MM-DD).' })
  startDate?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601({ strict: true }, { message: 'endDate must be a date (YYYY-MM-DD).' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate must be a date (YYYY-MM-DD).' })
  endDate?: string | null;

  @IsOptional()
  @lowerEmails()
  @IsArray()
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true, message: 'Each stakeholder must be a valid email address.' })
  stakeholders?: string[];
}
