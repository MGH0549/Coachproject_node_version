import { OpenAPIObject } from '@nestjs/swagger';
import { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
const str: SchemaObject = { type: 'string' };
const integer: SchemaObject = { type: 'integer' };
const number: SchemaObject = { type: 'number' };
const boolean: SchemaObject = { type: 'boolean' };
const id: SchemaObject = { type: 'string', format: 'uuid' };
const date: SchemaObject = { type: 'string', format: 'date-time' };
const nullable = (schema: SchemaObject): SchemaObject => ({
  ...schema,
  nullable: true,
});
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const list = (name: string): SchemaObject => ({
  type: 'array',
  items: ref(name),
});
const object = (
  properties: SchemaObject['properties'],
  optional: string[] = [],
): SchemaObject => ({
  type: 'object',
  properties,
  required: Object.keys(properties ?? {}).filter((k) => !optional.includes(k)),
});
const paged = (name: string) =>
  object({
    items: list(name),
    total: integer,
    page: integer,
    pageSize: integer,
  });
export function documentResponses(document: OpenAPIObject) {
  const macros = {
    calories: integer,
    protein: number,
    carbs: number,
    fat: number,
  };
  const schemas: Record<string, SchemaObject> = {
    Problem: object(
      {
        type: str,
        status: integer,
        code: str,
        message: str,
        requestId: str,
        errors: {
          type: 'array',
          items: object({
            field: str,
            messages: { type: 'array', items: str },
          }),
        },
      },
      ['errors'],
    ),
    Message: object({ message: str }),
    Session: object({ accessToken: str, expiresIn: integer }),
    Registration: object({
      id,
      status: { type: 'string', enum: ['Pending'] },
      whatsappUrl: { type: 'string', format: 'uri' },
    }),
    Client: object({
      id,
      userId: id,
      email: { type: 'string', format: 'email' },
      fullName: str,
      whatsapp: str,
      package: nullable(str),
      status: {
        type: 'string',
        enum: ['Pending', 'Active', 'Expired', 'Deactivated'],
      },
      accessEndAt: nullable(date),
      activatedAt: nullable(date),
      deactivatedAt: nullable(date),
      createdAt: date,
      version: integer,
    }),
    Account: {
      ...object({
        fullName: str,
        email: { type: 'string', format: 'email' },
        status: {
          type: 'string',
          enum: ['Pending', 'Active', 'Expired', 'Deactivated'],
        },
        accessEndsAt: nullable(date),
        package: nullable(str),
        timeZone: { type: 'string', enum: ['Africa/Cairo'] },
        whatsappUrl: { type: 'string', format: 'uri' },
      }),
      additionalProperties: false,
    },
    CoachAccount: {
      allOf: [
        ref('Client'),
        object({
          timeZone: { type: 'string', enum: ['Africa/Cairo'] },
          whatsappUrl: { type: 'string', format: 'uri' },
        }),
      ],
    },
    Exercise: object(
      {
        id,
        name: str,
        muscleGroup: str,
        youtubeVideoId: str,
        notes: str,
        archived: boolean,
        version: integer,
      },
      ['notes'],
    ),
    Alternative: object(
      {
        id,
        exerciseId: id,
        sets: integer,
        reps: str,
        note: str,
        exercise: ref('Exercise'),
      },
      ['sets', 'reps', 'note'],
    ),
    Placement: object(
      {
        id,
        exerciseId: id,
        sets: integer,
        reps: str,
        restSeconds: integer,
        tempo: str,
        note: str,
        order: integer,
        choicesLocked: boolean,
        selectedAlternativeId: nullable(id),
        exercise: ref('Exercise'),
        alternatives: list('Alternative'),
      },
      ['tempo', 'note'],
    ),
    Day: object({
      id,
      name: str,
      order: integer,
      exercises: list('Placement'),
    }),
    Training: object({
      id,
      clientId: nullable(id),
      name: str,
      isTemplate: boolean,
      choicesLocked: boolean,
      version: integer,
      days: list('Day'),
    }),
    Food: object({ food: str, quantity: number, unit: str }),
    Option: object({ id, name: str, ...macros, items: list('Food') }),
    Meal: object({
      id,
      name: str,
      time: nullable(str),
      order: integer,
      options: list('Option'),
      selection: {
        ...object({ optionId: id, locked: boolean }),
        nullable: true,
      },
    }),
    Diet: object(
      {
        id,
        clientId: nullable(id),
        name: str,
        isTemplate: boolean,
        choicesLocked: boolean,
        version: integer,
        ...macros,
        meals: list('Meal'),
        selectedTotals: object(macros),
      },
      ['selectedTotals'],
    ),
    TemplateSummary: object({ id, name: str, version: integer }),
    PhotoId: object({ id }),
    CheckIn: object(
      {
        id,
        clientId: id,
        weight: number,
        measurements: { type: 'object', additionalProperties: number },
        energy: integer,
        notes: str,
        feedback: nullable(str),
        version: integer,
        recordedAt: date,
        localDate: { type: 'string', format: 'date' },
        photos: list('PhotoId'),
      },
      ['notes'],
    ),
    Workout: object({
      id,
      clientId: id,
      planExerciseId: id,
      exerciseId: id,
      exerciseName: str,
      alternativeId: nullable(id),
      sets: integer,
      reps: str,
      recordedAt: date,
      localDate: { type: 'string', format: 'date' },
    }),
    PhotoLink: object({
      url: { type: 'string', format: 'uri' },
      expiresIn: integer,
    }),
    Health: object({ status: { type: 'string', enum: ['ok'] } }),
    Export: object({
      profile: ref('Client'),
      consentAt: date,
      training: { ...ref('Training'), nullable: true },
      diet: { ...ref('Diet'), nullable: true },
      checkIns: list('CheckIn'),
      workouts: {
        type: 'array',
        items: object({
          id,
          exerciseName: str,
          sets: integer,
          reps: str,
          localDate: str,
          recordedAt: date,
        }),
      },
      photos: {
        type: 'array',
        items: object({
          id,
          checkInId: id,
          url: { type: 'string', format: 'uri' },
          expiresIn: integer,
        }),
      },
    }),
    ClientPage: paged('Client'),
    ExercisePage: paged('Exercise'),
    TemplatePage: paged('TemplateSummary'),
    ProgressPage: paged('CheckIn'),
    WorkoutPage: paged('Workout'),
  };
  document.components ??= {};
  document.components.schemas = { ...document.components.schemas, ...schemas };
  const responses: Record<string, string> = {
    AuthController_register: 'Registration',
    AuthController_login: 'Session',
    AuthController_refresh: 'Session',
    AuthController_logout: 'Message',
    AuthController_forgot: 'Message',
    AuthController_reset: 'Message',
    ClientController_account: 'Account',
    ClientController_plan: 'Training',
    ClientController_exercise: 'Training',
    ClientController_dietPlan: 'Diet',
    ClientController_meal: 'Diet',
    ClientController_log: 'Workout',
    ClientController_workouts: 'WorkoutPage',
    ClientController_checkIn: 'CheckIn',
    ClientController_history: 'ProgressPage',
    ClientController_upload: 'PhotoId',
    ClientController_photo: 'PhotoLink',
    ClientController_removePhoto: 'Message',
    ClientController_export: 'Export',
    ClientController_delete: 'Message',
    CoachController_list: 'ClientPage',
    CoachController_client: 'CoachAccount',
    CoachController_activate: 'CoachAccount',
    CoachController_deactivate: 'Message',
    CoachController_extend: 'CoachAccount',
    CoachController_library: 'ExercisePage',
    CoachController_createExercise: 'Exercise',
    CoachController_updateExercise: 'Exercise',
    CoachController_archive: 'Message',
    CoachController_removeExercise: 'Message',
    CoachController_trainingPlan: 'Training',
    CoachController_saveTraining: 'Training',
    CoachController_lockTraining: 'Training',
    CoachController_selectExercise: 'Training',
    CoachController_dietPlan: 'Diet',
    CoachController_saveDiet: 'Diet',
    CoachController_lockDiet: 'Diet',
    CoachController_selectMeal: 'Diet',
    CoachController_progressHistory: 'ProgressPage',
    CoachController_workouts: 'WorkoutPage',
    CoachController_feedback: 'Message',
    CoachController_photo: 'PhotoLink',
    CoachController_deletePhoto: 'Message',
    CoachController_export: 'Export',
    CoachController_delete: 'Message',
    TemplatesController_trainingList: 'TemplatePage',
    TemplatesController_dietList: 'TemplatePage',
    TemplatesController_getTraining: 'Training',
    TemplatesController_getDiet: 'Diet',
    TemplatesController_createTraining: 'Training',
    TemplatesController_editTraining: 'Training',
    TemplatesController_createDiet: 'Diet',
    TemplatesController_editDiet: 'Diet',
    TemplatesController_copyTraining: 'Training',
    TemplatesController_copyDiet: 'Diet',
    HealthController_health: 'Health',
  };
  for (const path of Object.values(document.paths))
    for (const method of ['get', 'post', 'put', 'delete'] as const) {
      const operation = path?.[method];
      if (!operation) continue;
      const schema = responses[operation.operationId ?? ''];
      if (operation.operationId === 'AuthController_register')
        operation.description =
          'Returns 201 with Pending registration details only; creates no session or cookie. Call login next.';
      if (operation.operationId === 'ClientController_account')
        operation.description =
          'Available to authenticated clients including Pending, Expired and Deactivated. Returns only the seven account fields; no internal database fields.';
      if (schema)
        for (const [status, response] of Object.entries(operation.responses))
          if (response && status.startsWith('2') && !('$ref' in response))
            response.content = { 'application/json': { schema: ref(schema) } };
      for (const status of [400, 401, 403, 404, 409, 413, 429, 500, 503])
        operation.responses[status] = {
          description: 'Problem response; stable code and Arabic message',
          content: { 'application/problem+json': { schema: ref('Problem') } },
        };
      if (
        operation.operationId?.startsWith('ClientController_') &&
        ![
          'ClientController_account',
          'ClientController_export',
          'ClientController_delete',
        ].includes(operation.operationId)
      )
        operation.responses[403] = {
          description:
            'Pending, Expired and Deactivated clients receive ACCESS_INACTIVE. Other access restrictions may also return 403.',
          content: { 'application/problem+json': { schema: ref('Problem') } },
        };
    }
}
