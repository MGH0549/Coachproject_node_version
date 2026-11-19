import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ClientsService } from '../../application/clients/clients.service';
import { PrivacyService } from '../../application/clients/privacy.service';
import { TrainingService } from '../../application/training/training.service';
import { DietService } from '../../application/diet/diet.service';
import { ProgressService } from '../../application/progress/progress.service';
import { Active, ApiRequest, Roles } from '../security';
import { unwrap } from '../problem.filter';
import {
  CheckInDto,
  ExerciseChoiceDto,
  MealChoiceDto,
  PageDto,
  WorkoutDto,
} from '../dtos';
@ApiTags('Client')
@ApiBearerAuth()
@Roles('Client')
@Controller('me')
export class ClientController {
  constructor(
    private readonly clients: ClientsService,
    private readonly privacy: PrivacyService,
    private readonly training: TrainingService,
    private readonly diet: DietService,
    private readonly progress: ProgressService,
  ) {}
  @Get() async account(@Req() req: ApiRequest) {
    return unwrap(await this.clients.clientAccount(req.user.clientId!));
  }
  @Get('training') @Active() async plan(@Req() req: ApiRequest) {
    return unwrap(await this.training.get(req.user.clientId!));
  }
  @Put('training/exercises/:id/selection') @Active() async exercise(
    @Req() req: ApiRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ExerciseChoiceDto,
  ) {
    return unwrap(
      await this.training.choose(
        req.user,
        req.user.clientId!,
        id,
        dto.alternativeId ?? null,
        dto.version,
      ),
    );
  }
  @Get('diet') @Active() async dietPlan(@Req() req: ApiRequest) {
    return unwrap(await this.diet.get(req.user.clientId!));
  }
  @Put('diet/meals/:id/selection') @Active() async meal(
    @Req() req: ApiRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: MealChoiceDto,
  ) {
    return unwrap(
      await this.diet.choose(
        req.user,
        req.user.clientId!,
        id,
        dto.optionId,
        dto.version,
      ),
    );
  }
  @Post('workouts') @Active() async log(
    @Req() req: ApiRequest,
    @Body() dto: WorkoutDto,
  ) {
    return unwrap(
      await this.progress.log(
        req.user.clientId!,
        dto.planExerciseId,
        dto.alternativeId ?? null,
      ),
    );
  }
  @Get('workouts') @Active() async workouts(
    @Req() req: ApiRequest,
    @Query() query: PageDto,
  ) {
    return unwrap(await this.progress.workouts(req.user.clientId!, query));
  }
  @Post('check-ins') @Active() async checkIn(
    @Req() req: ApiRequest,
    @Body() dto: CheckInDto,
  ) {
    return unwrap(await this.progress.submit(req.user.clientId!, dto));
  }
  @Get('progress') @Active() async history(
    @Req() req: ApiRequest,
    @Query() query: PageDto,
  ) {
    return unwrap(await this.progress.history(req.user.clientId!, query));
  }
  @Post('check-ins/:id/photos')
  @Active()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { photo: { type: 'string', format: 'binary' } },
      required: ['photo'],
    },
  })
  async upload(
    @Req() req: ApiRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const part = await req.file();
    if (!part || part.fieldname !== 'photo')
      return unwrap({
        ok: false,
        error: { code: 'PHOTO_REQUIRED', message: 'اختر صورة', status: 400 },
      });
    return unwrap(
      await this.progress.upload(req.user.clientId!, id, await part.toBuffer()),
    );
  }
  @Get('photos/:id') @Active() async photo(
    @Req() req: ApiRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return unwrap(await this.progress.photo(req.user.clientId!, id));
  }
  @Delete('photos/:id') @Active() async removePhoto(
    @Req() req: ApiRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return unwrap(await this.progress.removePhoto(req.user.clientId!, id));
  }
  @Get('export') async export(@Req() req: ApiRequest) {
    return unwrap(await this.privacy.export(req.user, req.user.clientId!));
  }
  @Delete() async delete(@Req() req: ApiRequest) {
    return unwrap(await this.privacy.delete(req.user, req.user.clientId!));
  }
}
