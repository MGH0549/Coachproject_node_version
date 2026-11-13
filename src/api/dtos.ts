import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
const msg = { message: 'القيمة المدخلة غير صالحة' };
export class LoginDto {
  @ApiProperty({
    format: 'email',
    example: 'client@example.com',
    maxLength: 254,
  })
  @IsEmail({}, { message: 'أدخل بريداً إلكترونياً صالحاً' })
  @MaxLength(254, msg)
  email!: string;
  @ApiProperty({ minLength: 1, maxLength: 128, example: 'ExamplePassword123' })
  @IsString(msg)
  @Length(1, 128, msg)
  password!: string;
}
export class RegisterDto extends LoginDto {
  @ApiProperty({
    minLength: 12,
    maxLength: 128,
    example: 'ExamplePassword123',
    description: '12–128 characters containing letters and numbers',
  })
  @IsString(msg)
  @Length(12, 128, { message: 'كلمة المرور يجب أن تكون من 12 إلى 128 حرفاً' })
  @Matches(/^(?=.*[\p{L}])(?=.*\d).+$/u, {
    message: 'كلمة المرور يجب أن تحتوي على حروف وأرقام',
  })
  declare password: string;
  @ApiProperty({ example: 'أحمد محمد', minLength: 2, maxLength: 120 })
  @IsString(msg)
  @Length(2, 120, { message: 'الاسم يجب أن يكون من حرفين إلى 120 حرفاً' })
  fullName!: string;
  @ApiProperty({
    example: '201000000001',
    pattern: '^\\+?\\d{8,15}$',
    description:
      'International number, 8–15 digits, optional leading +, without spaces',
  })
  @Matches(/^\+?\d{8,15}$/, {
    message: 'أدخل رقم واتساب من 8 إلى 15 رقماً مع كود الدولة وبدون مسافات',
  })
  whatsapp!: string;
  @ApiProperty({
    enum: [true],
    example: true,
    description:
      'Explicit consent to processing personal and health data is required',
  })
  @Equals(true, { message: 'الموافقة الصريحة على معالجة البيانات مطلوبة' })
  consent!: boolean;
}
export class ForgotDto {
  @ApiProperty() @IsEmail({}, msg) @MaxLength(254, msg) email!: string;
}
export class ResetDto {
  @ApiProperty() @IsString(msg) @Length(32, 128, msg) token!: string;
  @ApiProperty()
  @IsString(msg)
  @Length(12, 128, msg)
  @Matches(/^(?=.*[\p{L}])(?=.*\d).+$/u, msg)
  password!: string;
}
export class PageDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt(msg)
  @Min(1, msg)
  @Max(1000000, msg)
  page = 1;
  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Type(() => Number)
  @IsInt(msg)
  @Min(1, msg)
  @Max(100, msg)
  pageSize = 20;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString(msg)
  @MaxLength(120, msg)
  search?: string;
  @ApiPropertyOptional({
    enum: ['Pending', 'Active', 'Expired', 'Deactivated'],
  })
  @IsOptional()
  @IsIn(['Pending', 'Active', 'Expired', 'Deactivated'], msg)
  status?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString(msg)
  @MaxLength(100, msg)
  muscleGroup?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean(msg)
  archived?: boolean;
}
export class VersionDto {
  @ApiProperty() @IsInt(msg) @Min(1, msg) version!: number;
}
export class AccessDto extends VersionDto {
  @ApiPropertyOptional({ example: '2027-01-31' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, msg)
  endDate?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString(msg)
  @Length(1, 120, msg)
  package?: string;
}
export class ExerciseDto {
  @ApiProperty() @IsString(msg) @Length(1, 160, msg) name!: string;
  @ApiProperty() @IsString(msg) @Length(1, 100, msg) muscleGroup!: string;
  @ApiProperty() @Matches(/^[A-Za-z0-9_-]{11}$/, msg) youtubeVideoId!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString(msg)
  @MaxLength(3000, msg)
  notes?: string;
}
export class UpdateExerciseDto extends ExerciseDto {
  @ApiProperty() @IsInt(msg) @Min(1, msg) version!: number;
}
export class AlternativeDto {
  @ApiProperty() @IsUUID('4', msg) exerciseId!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt(msg)
  @Min(1, msg)
  @Max(100, msg)
  sets?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString(msg)
  @Length(1, 80, msg)
  reps?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString(msg)
  @MaxLength(3000, msg)
  note?: string;
}
export class PlacementDto {
  @ApiProperty() @IsUUID('4', msg) exerciseId!: string;
  @ApiProperty() @IsInt(msg) @Min(1, msg) @Max(100, msg) sets!: number;
  @ApiProperty() @IsString(msg) @Length(1, 80, msg) reps!: string;
  @ApiProperty() @IsInt(msg) @Min(0, msg) @Max(3600, msg) restSeconds!: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString(msg)
  @MaxLength(80, msg)
  tempo?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString(msg)
  @MaxLength(3000, msg)
  note?: string;
  @ApiProperty() @IsInt(msg) @Min(0, msg) @Max(1000, msg) order!: number;
  @ApiProperty({ type: [AlternativeDto] })
  @IsArray(msg)
  @ArrayMaxSize(10, msg)
  @ValidateNested({ each: true })
  @Type(() => AlternativeDto)
  alternatives!: AlternativeDto[];
}
export class DayDto {
  @ApiProperty() @IsString(msg) @Length(1, 120, msg) name!: string;
  @ApiProperty() @IsInt(msg) @Min(0, msg) @Max(100, msg) order!: number;
  @ApiProperty({ type: [PlacementDto] })
  @IsArray(msg)
  @ArrayMaxSize(30, msg)
  @ValidateNested({ each: true })
  @Type(() => PlacementDto)
  exercises!: PlacementDto[];
}
export class TrainingDto {
  @ApiProperty() @IsString(msg) @Length(1, 160, msg) name!: string;
  @ApiProperty({ type: [DayDto] })
  @IsArray(msg)
  @ArrayMinSize(1, msg)
  @ArrayMaxSize(14, msg)
  @ValidateNested({ each: true })
  @Type(() => DayDto)
  days!: DayDto[];
  @ApiPropertyOptional({
    description: 'Required when replacing an existing plan',
  })
  @IsOptional()
  @IsInt(msg)
  @Min(1, msg)
  version?: number;
}
export class MacrosDto {
  @ApiProperty() @IsInt(msg) @Min(0, msg) @Max(20000, msg) calories!: number;
  @ApiProperty()
  @IsNumber({ allowInfinity: false, allowNaN: false }, msg)
  @Min(0, msg)
  @Max(3000, msg)
  protein!: number;
  @ApiProperty()
  @IsNumber({ allowInfinity: false, allowNaN: false }, msg)
  @Min(0, msg)
  @Max(3000, msg)
  carbs!: number;
  @ApiProperty()
  @IsNumber({ allowInfinity: false, allowNaN: false }, msg)
  @Min(0, msg)
  @Max(3000, msg)
  fat!: number;
}
export class FoodDto {
  @ApiProperty() @IsString(msg) @Length(1, 160, msg) food!: string;
  @ApiProperty()
  @IsNumber({}, msg)
  @Min(0.01, msg)
  @Max(100000, msg)
  quantity!: number;
  @ApiProperty() @IsString(msg) @Length(1, 40, msg) unit!: string;
}
export class OptionDto extends MacrosDto {
  @ApiProperty() @IsString(msg) @Length(1, 160, msg) name!: string;
  @ApiProperty({ type: [FoodDto] })
  @IsArray(msg)
  @ArrayMinSize(1, msg)
  @ArrayMaxSize(30, msg)
  @ValidateNested({ each: true })
  @Type(() => FoodDto)
  items!: FoodDto[];
}
export class MealDto {
  @ApiProperty() @IsString(msg) @Length(1, 120, msg) name!: string;
  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, msg)
  time?: string;
  @ApiProperty() @IsInt(msg) @Min(0, msg) @Max(100, msg) order!: number;
  @ApiProperty({ type: [OptionDto] })
  @IsArray(msg)
  @ArrayMinSize(2, msg)
  @ArrayMaxSize(10, msg)
  @ValidateNested({ each: true })
  @Type(() => OptionDto)
  options!: OptionDto[];
}
export class DietDto extends MacrosDto {
  @ApiProperty() @IsString(msg) @Length(1, 160, msg) name!: string;
  @ApiProperty({ type: [MealDto] })
  @IsArray(msg)
  @ArrayMinSize(1, msg)
  @ArrayMaxSize(12, msg)
  @ValidateNested({ each: true })
  @Type(() => MealDto)
  meals!: MealDto[];
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt(msg)
  @Min(1, msg)
  version?: number;
}
export class ExerciseChoiceDto extends VersionDto {
  @ApiPropertyOptional({
    nullable: true,
    description: 'null selects the main exercise',
  })
  @IsOptional()
  @IsUUID('4', msg)
  alternativeId?: string | null;
}
export class CoachExerciseChoiceDto extends ExerciseChoiceDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean(msg)
  locked?: boolean;
}
export class MealChoiceDto extends VersionDto {
  @ApiProperty() @IsUUID('4', msg) optionId!: string;
}
export class CoachMealChoiceDto extends MealChoiceDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean(msg)
  locked?: boolean;
}
export class LockDto extends VersionDto {
  @ApiProperty() @IsBoolean(msg) locked!: boolean;
}
export class CheckInDto {
  @ApiProperty()
  @IsNumber({}, msg)
  @Min(20, msg)
  @Max(500, msg)
  weight!: number;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  @IsObject(msg)
  measurements!: Record<string, number>;
  @ApiProperty() @IsInt(msg) @Min(1, msg) @Max(10, msg) energy!: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString(msg)
  @MaxLength(5000, msg)
  notes?: string;
}
export class WorkoutDto {
  @ApiProperty() @IsUUID('4', msg) planExerciseId!: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID('4', msg)
  alternativeId?: string | null;
}
export class FeedbackDto extends VersionDto {
  @ApiProperty() @IsString(msg) @Length(1, 5000, msg) feedback!: string;
}
export class CopyDto {
  @ApiProperty() @IsUUID('4', msg) clientId!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt(msg)
  @Min(1, msg)
  version?: number;
}
