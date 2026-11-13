import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TemplatesService } from '../../application/templates/templates.service';
import { TrainingService } from '../../application/training/training.service';
import { DietService } from '../../application/diet/diet.service';
import { CopyDto, DietDto, PageDto, TrainingDto } from '../dtos';
import { ApiRequest, Roles } from '../security';
import { unwrap } from '../problem.filter';
@ApiTags('Templates')
@ApiBearerAuth()
@Roles('Coach')
@Controller('coach/templates')
export class TemplatesController {
  constructor(
    private readonly templates: TemplatesService,
    private readonly training: TrainingService,
    private readonly diet: DietService,
  ) {}
  @Get('training') async trainingList(@Query() q: PageDto) {
    return unwrap(await this.templates.list('training', q));
  }
  @Get('diet') async dietList(@Query() q: PageDto) {
    return unwrap(await this.templates.list('diet', q));
  }
  @Get('training/:id') async getTraining(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return unwrap(await this.templates.get('training', id));
  }
  @Get('diet/:id') async getDiet(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return unwrap(await this.templates.get('diet', id));
  }
  @Post('training') async createTraining(
    @Req() req: ApiRequest,
    @Body() dto: TrainingDto,
  ) {
    const { version, ...input } = dto;
    return unwrap(await this.training.save(req.user, input, { version }));
  }
  @Put('training/:id') async editTraining(
    @Req() req: ApiRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: TrainingDto,
  ) {
    const { version, ...input } = dto;
    return unwrap(await this.training.save(req.user, input, { id, version }));
  }
  @Post('diet') async createDiet(@Req() req: ApiRequest, @Body() dto: DietDto) {
    const { version, ...input } = dto;
    return unwrap(await this.diet.save(req.user, input, { version }));
  }
  @Put('diet/:id') async editDiet(
    @Req() req: ApiRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: DietDto,
  ) {
    const { version, ...input } = dto;
    return unwrap(await this.diet.save(req.user, input, { id, version }));
  }
  @Post('training/:id/copy') async copyTraining(
    @Req() req: ApiRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CopyDto,
  ) {
    return unwrap(
      await this.templates.copy(
        req.user,
        'training',
        id,
        dto.clientId,
        dto.version,
      ),
    );
  }
  @Post('diet/:id/copy') async copyDiet(
    @Req() req: ApiRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CopyDto,
  ) {
    return unwrap(
      await this.templates.copy(
        req.user,
        'diet',
        id,
        dto.clientId,
        dto.version,
      ),
    );
  }
}
