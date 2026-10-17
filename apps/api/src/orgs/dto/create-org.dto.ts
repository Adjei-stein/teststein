import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { Trim } from '../../common/trim';
import { SLUG_PATTERN } from '../slug';

export class CreateOrgDto {
  @Trim()
  @IsString()
  @Length(1, 100)
  name: string;

  /** Optional; generated from the name when omitted. */
  @IsOptional()
  @Trim()
  @Matches(SLUG_PATTERN, {
    message: 'slug must be 3–40 characters: lowercase letters, digits and hyphens, not starting or ending with a hyphen.',
  })
  slug?: string;
}
