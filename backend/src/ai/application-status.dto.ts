import { IsBoolean, IsIn, IsOptional } from "class-validator";
export class ApplicationStatusDto {
  @IsBoolean()
  applied!: boolean;
}
export class HistoryFilterDto {
  @IsOptional()
  @IsIn(["generated", "applied"])
  status?: "generated" | "applied";
}
