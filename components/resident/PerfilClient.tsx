'use client';

import { useTranslations } from 'next-intl';
import { User, Phone, Mail, Home } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { ResidentPortalData } from '@/lib/resident/queries';

function InfoField({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
        <span className="text-sm font-medium break-words">{value}</span>
      </div>
    </div>
  );
}

export function PerfilClient({ data }: { data: ResidentPortalData }) {
  const t = useTranslations('residentPerfil');
  const house = data.house!;

  const houseLabel = house.house_name ? `${house.house_number} · ${house.house_name}` : house.house_number;

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold md:text-2xl">{t('heading')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <InfoField icon={Home} label={t('houseNumber')} value={houseLabel} />
            {house.owner_name && <InfoField icon={User} label={t('owner')} value={house.owner_name} />}
            {house.owner_phone && <InfoField icon={Phone} label={t('phone')} value={house.owner_phone} />}
            {house.owner_email && <InfoField icon={Mail} label={t('email')} value={house.owner_email} />}
          </div>

          {data.residents.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t('residents')}
              </span>
              <div className="flex flex-col gap-1">
                {data.residents.map((r) => (
                  <span key={r.id} className="text-sm">
                    {r.resident_name}
                    {r.resident_phone ? ` · ${r.resident_phone}` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
