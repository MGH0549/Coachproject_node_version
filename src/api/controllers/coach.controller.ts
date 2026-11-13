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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClientsService } from '../../application/clients/clients.service';
import { PrivacyService } from '../../application/clients/privacy.service';
import { ExercisesService } from '../../application/exercises/exercises.service';
import { TrainingService } from '../../application/training/training.service';
import { DietService } from '../../application/diet/diet.service';
import { ProgressService } from '../../application/progress/progress.service';
import { ApiRequest, Roles } from '../security';
import { unwrap } from '../problem.filter';
import {
  AccessDto,
  CoachExerciseChoiceDto,
  CoachMealChoiceDto,
  DietDto,
  ExerciseDto,
  FeedbackDto,
  LockDto,
  PageDto,
  TrainingDto,
  UpdateExerciseDto,
  VersionDto,
} from '../dtos';
const uuid = () => new ParseUUIDPipe({ version: '4' });
@ApiTags('Coach')
@ApiBearerAuth()
@Roles('Coach')
@Controller('coach')
export class CoachController {
  constructor(
    private readonly clients: ClientsService,
    private readonly privacy: PrivacyService,
    private readonly exercises: ExercisesService,
    private readonly training: TrainingService,
    private readonly diet: DietService,
    private readonly progress: ProgressService,
  ) {}
  @Get('clients') async list(@Query() q: PageDto) {
    return unwrap(await this.clients.list(q));
  }
  @Get('clients/:clientId') async client(
    @Param('clientId', uuid()) id: string,
  ) {
    return unwrap(await this.clients.account(id));
  }
  @Post('clients/:clientId/activate') async activate(
    @Req() req: ApiRequest,
    @Param('clientId', uuid()) id: string,
    @Body() dto: AccessDto,
  ) {
    return unwrap(await this.clients.change(req.user, id, 'activate', dto));
  }
  @Post('clients/:clientId/deactivate') async deactivate(
    @Req() req: ApiRequest,
    @Param('clientId', uuid()) id: string,
    @Body() dto: VersionDto,
  ) {
    return unwrap(await this.clients.change(req.user, id, 'deactivate', dto));
  }
  @Post('clients/:clientId/extend') async extend(
    @Req() req: ApiRequest,
    @Param('clientId', uuid()) id: string,
    @Body() dto: AccessDto,
  ) {
    return unwrap(await this.clients.change(req.user, id, 'extend', dto));
  }
  @Get('exercises') async library(@Query() q: PageDto) {
    return unwrap(await this.exercises.list(q));
  }
  @Post('exercises') async createExercise(
    @Req() req: ApiRequest,
    @Body() dto: ExerciseDto,
  ) {
    return unwrap(await this.exercises.save(req.user, dto));
  }
  @Put('exercises/:id') async updateExercise(
    @Req() req: ApiRequest,
    @Param('id', uuid()) id: string,
    @Body() dto: UpdateExerciseDto,
  ) {
    const { version, ...input } = dto;
    return unwrap(await this.exercises.save(req.user, input, id, version));
  }
  @Post('exercises/:id/archive') async archive(
    @Req() req: ApiRequest,
    @Param('id', uuid()) id: string,
    @Body() dto: VersionDto,
  ) {
    return unwrap(await this.exercises.archive(req.user, id, dto.version));
  }
  @Delete('exercises/:id') async removeExercise(
    @Req() req: ApiRequest,
    @Param('id', uuid()) id: string,
    @Body() dto: VersionDto,
  ) {
    return unwrap(await this.exercises.remove(req.user, id, dto.version));
  }
  @Get('clients/:clientId/training') async trainingPlan(
    @Param('clientId', uuid()) id: string,
  ) {
    return unwrap(await this.training.get(id));
  }
  @Put('clients/:clientId/training') async saveTraining(
    @Req() req: ApiRequest,
    @Param('clientId', uuid()) id: string,
    @Body() dto: TrainingDto,
  ) {
    const { version, ...input } = dto;
    return unwrap(
      await this.training.save(req.user, input, { clientId: id, version }),
    );
  }
  @Put('clients/:clientId/training/lock') async lockTraining(
    @Req() req: ApiRequest,
    @Param('clientId', uuid()) id: string,
    @Body() dto: LockDto,
  ) {
    return unwrap(
      await this.training.lock(req.user, id, dto.locked, dto.version),
    );
  }
  @Put('clients/:clientId/training/exercises/:id/selection')
  async selectExercise(
    @Req() req: ApiRequest,
    @Param('clientId', uuid()) clientId: string,
    @Param('id', uuid()) id: string,
    @Body() dto: CoachExerciseChoiceDto,
  ) {
    return unwrap(
      await this.training.choose(
        req.user,
        clientId,
        id,
        dto.alternativeId ?? null,
        dto.version,
        dto.locked,
      ),
    );
  }
  @Get('clients/:clientId/diet') async dietPlan(
    @Param('clientId', uuid()) id: string,
  ) {
    return unwrap(await this.diet.get(id));
  }
  @Put('clients/:clientId/diet') async saveDiet(
    @Req() req: ApiRequest,
    @Param('clientId', uuid()) id: string,
    @Body() dto: DietDto,
  ) {
    const { version, ...input } = dto;
    return unwrap(
      await this.diet.save(req.user, input, { clientId: id, version }),
    );
  }
  @Put('clients/:clientId/diet/lock') async lockDiet(
    @Req() req: ApiRequest,
    @Param('clientId', uuid()) id: string,
    @Body() dto: LockDto,
  ) {
    return unwrap(await this.diet.lock(req.user, id, dto.locked, dto.version));
  }
  @Put('clients/:clientId/diet/meals/:id/selection') async selectMeal(
    @Req() req: ApiRequest,
    @Param('clientId', uuid()) clientId: string,
    @Param('id', uuid()) id: string,
    @Body() dto: CoachMealChoiceDto,
  ) {
    return unwrap(
      await this.diet.choose(
        req.user,
        clientId,
        id,
        dto.optionId,
        dto.version,
        dto.locked,
      ),
    );
  }
  @Get('clients/:clientId/progress') async progressHistory(
    @Param('clientId', uuid()) id: string,
    @Query() q: PageDto,
  ) {
    return unwrap(await this.progress.history(id, q));
  }
  @Get('clients/:clientId/workouts') async workouts(
    @Param('clientId', uuid()) id: string,
    @Query() q: PageDto,
  ) {
    return unwrap(await this.progress.workouts(id, q));
  }
  @Put('clients/:clientId/check-ins/:id/feedback') async feedback(
    @Req() req: ApiRequest,
    @Param('clientId', uuid()) clientId: string,
    @Param('id', uuid()) id: string,
    @Body() dto: FeedbackDto,
  ) {
    return unwrap(
      await this.progress.feedback(
        req.user,
        clientId,
        id,
        dto.feedback,
        dto.version,
      ),
    );
  }
  @Get('clients/:clientId/photos/:id') async photo(
    @Param('clientId', uuid()) clientId: string,
    @Param('id', uuid()) id: string,
  ) {
    return unwrap(await this.progress.photo(clientId, id));
  }
  @Delete('clients/:clientId/photos/:id') async deletePhoto(
    @Param('clientId', uuid()) clientId: string,
    @Param('id', uuid()) id: string,
  ) {
    return unwrap(await this.progress.removePhoto(clientId, id));
  }
  @Get('clients/:clientId/export') async export(
    @Req() req: ApiRequest,
    @Param('clientId', uuid()) id: string,
  ) {
    return unwrap(await this.privacy.export(req.user, id));
  }
  @Delete('clients/:clientId') async delete(
    @Req() req: ApiRequest,
    @Param('clientId', uuid()) id: string,
  ) {
    return unwrap(await this.privacy.delete(req.user, id));
  }
}
