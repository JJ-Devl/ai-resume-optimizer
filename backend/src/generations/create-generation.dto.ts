import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  IsUrl,
} from "class-validator";

export const scenarios = [
  "success",
  "validation",
  "rate-limit",
  "unavailable",
  "server-error",
  "timeout",
  "slow",
] as const;
export type Scenario = (typeof scenarios)[number];

export class CreateGenerationDto {
  @IsString()
  @MaxLength(200)
  @Matches(/^[^/\\\r\n]+\.(pdf|docx)$/i, {
    message: "Choose a PDF or DOCX resume filename.",
  })
  resumeFilename!: string;

  @IsInt()
  @Min(1)
  @Max(5 * 1024 * 1024, { message: "Your resume must be 5 MB or smaller." })
  resumeSize!: number;

  @IsString()
  @Matches(/\S/, { message: "Paste the job description to continue." })
  @MaxLength(30000)
  jobDescription!: string;

  @IsOptional()
  @IsUrl({
    protocols: ["http", "https"],
    require_protocol: true,
    require_tld: false,
  })
  @MaxLength(2048)
  jobUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  customPrompt?: string;

  @IsOptional()
  @IsIn(scenarios)
  scenario?: Scenario;
}
