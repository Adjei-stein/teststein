import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { DatabaseError } from 'pg';

/** Friendly messages for constraints users can trip with valid-looking input. */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  users_email_key: 'An account with this email already exists.',
  projects_org_id_key_key: 'A project with this key already exists in this organisation.',
  projects_check: "End date can't be before the start date.",
};

/**
 * Turns Postgres constraint errors into 4xx responses instead of 500s. The database is
 * the final authority on integrity rules, so this keeps those rules in one place.
 */
@Catch(DatabaseError)
export class PgExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PgExceptionFilter.name);

  catch(error: DatabaseError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const known = error.constraint ? CONSTRAINT_MESSAGES[error.constraint] : undefined;

    const map: Record<string, [HttpStatus, string]> = {
      '23505': [HttpStatus.CONFLICT, known ?? 'This conflicts with an existing record.'],
      '23514': [HttpStatus.BAD_REQUEST, known ?? 'The data breaks a validation rule.'],
      '23503': [HttpStatus.BAD_REQUEST, 'A referenced record does not exist.'],
      '22P02': [HttpStatus.BAD_REQUEST, 'A value has the wrong format.'],
      '42501': [HttpStatus.FORBIDDEN, 'You do not have access to this resource.'],
    };
    const mapped = error.code ? map[error.code] : undefined;
    if (!mapped) {
      this.logger.error(`Unhandled database error ${error.code}: ${error.message}`, error.stack);
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      });
      return;
    }
    const [status, message] = mapped;
    response.status(status).json({ statusCode: status, message, constraint: error.constraint });
  }
}
