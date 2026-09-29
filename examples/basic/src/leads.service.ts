import { Injectable } from '@nestjs/common';
import { MetaCapiService } from 'nestjs-meta-capi';

export interface Lead {
  id: string;
  email: string;
  amount: number;
}

@Injectable()
export class LeadsService {
  constructor(private readonly metaCapi: MetaCapiService) {}

  async createLead(email: string): Promise<Lead> {
    const lead: Lead = { id: 'lead-1', email, amount: 500 };

    // Decorators are optional — the service works anywhere, including outside
    // an HTTP request.
    await this.metaCapi.track({
      eventName: 'LeadSubmitted',
      eventId: lead.id,
      userData: { email: lead.email },
      customData: { contentName: 'Newsletter Signup' },
    });

    return lead;
  }
}
