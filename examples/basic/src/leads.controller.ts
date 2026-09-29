import { Body, Controller, Post } from '@nestjs/common';
import { MetaDataset, MetaEvent } from 'nestjs-meta-capi';

import { LeadsService, type Lead } from './leads.service';

interface CreateLeadDto {
  email: string;
}

@Controller('leads')
@MetaDataset('primary')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post()
  @MetaEvent<Lead>({
    name: 'Lead',
    eventId: (lead) => lead.id,
    user: (lead) => ({ email: lead.email }),
    customData: (lead) => ({
      value: lead.amount,
      currency: 'USD',
      contentName: 'Newsletter Signup',
    }),
  })
  async create(@Body() dto: CreateLeadDto): Promise<Lead> {
    return this.leads.createLead(dto.email);
  }
}
