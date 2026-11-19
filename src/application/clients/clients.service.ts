import { Actor, PageQuery } from '../../domain/models';
import { conflict, fail, missing, ok } from '../../domain/result';
import { effectiveStatus, validateEnd } from '../../domain/rules/access';
import { Clock, Settings, Store } from '../common/ports';
export class ClientsService {
  constructor(
    private readonly db: Store,
    private readonly clock: Clock,
    private readonly settings: Settings,
  ) {}
  async clientAccount(id: string) {
    const result = await this.account(id);
    if (!result.ok) return result;
    const client = result.value;
    return ok({
      fullName: client.fullName,
      email: client.email,
      status: client.status,
      accessEndsAt: client.accessEndAt,
      package: client.package,
      timeZone: client.timeZone,
      whatsappUrl: client.whatsappUrl,
    });
  }
  async account(id: string) {
    const client = await this.db.client(id);
    return client
      ? ok({
          ...client,
          status: effectiveStatus(client, this.clock.now()),
          timeZone: 'Africa/Cairo',
          whatsappUrl: `https://wa.me/${this.settings.whatsapp}?text=${encodeURIComponent(`مرحباً، أرغب في التواصل بخصوص اشتراكي. بريدي الإلكتروني: ${client.email}`)}`,
        })
      : missing();
  }
  async list(query: PageQuery) {
    const page = await this.db.clients(query, this.clock.now());
    return ok({
      ...page,
      items: page.items.map((c) => ({
        ...c,
        status: effectiveStatus(c, this.clock.now()),
      })),
    });
  }
  async change(
    actor: Actor,
    id: string,
    action: 'activate' | 'deactivate' | 'extend',
    input: { version: number; endDate?: string; package?: string },
  ) {
    const client = await this.db.client(id);
    if (!client) return missing();
    if (client.version !== input.version) return conflict();
    if (action === 'deactivate')
      return (await this.db.changeAccess(actor, id, input.version, {
        status: 'Deactivated',
        deactivatedAt: this.clock.now(),
      }))
        ? ok({ message: 'تم إيقاف الحساب' })
        : conflict();
    const end = input.endDate ? this.clock.endOfDay(input.endDate) : null;
    if (!end) return fail('INVALID_END_DATE', 'تاريخ الانتهاء غير صالح');
    const valid = validateEnd(
      end,
      this.clock.now(),
      action === 'extend' ? client.accessEndAt : undefined,
    );
    if (!valid.ok) return valid;
    if (action === 'extend' && client.status !== 'Active')
      return fail('ACTIVATION_REQUIRED', 'فعّل الحساب أولاً');
    if (action === 'activate' && !input.package)
      return fail('PACKAGE_REQUIRED', 'اسم الباقة مطلوب');
    return (await this.db.changeAccess(actor, id, input.version, {
      status: 'Active',
      accessEndAt: end,
      package: input.package,
      activatedAt: action === 'activate' ? this.clock.now() : undefined,
      deactivatedAt: null,
    }))
      ? this.account(id)
      : conflict();
  }
}
