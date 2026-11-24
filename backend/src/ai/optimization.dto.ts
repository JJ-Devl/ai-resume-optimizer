import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from "class-validator";
export class OptimizationDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  companyName?: string;
  @IsOptional()
  @IsString()
  @MaxLength(160)
  jobTitle?: string;
  @IsString()
  @Matches(/\S/, { message: "Paste the job description to continue." })
  @MaxLength(30000)
  jobDescription!: string;
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  customPrompt?: string;
  @IsOptional()
  @IsUrl({
    protocols: ["http", "https"],
    require_protocol: true,
    require_tld: false,
  })
  @MaxLength(2048)
  jobUrl?: string;
}
