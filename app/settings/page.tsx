'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { MasterPasswordGate } from '@/components/MasterPasswordGate';
import { PageHeading } from '@/components/ui/PageHeading';
import { CheckIcon } from '@/components/ui/icons';

export default function SettingsPage() {
  return <MasterPasswordGate>{(masterPassword) => <SettingsContent masterPassword={masterPassword} />}</MasterPasswordGate>;
}

// Split out so this content — and its data-loading effect — only mounts
// once MasterPasswordGate has actually unlocked (same reasoning as
// RecompensasContent in app/recompensas/page.tsx).
function SettingsContent({ masterPassword }: { masterPassword: string }) {
  const [prefixLength, setPrefixLength] = useState<number | ''>('');
  const [requireSku, setRequireSku] = useState(true);
  const [cashbackPercent, setCashbackPercent] = useState<number | ''>('');
  const [cashbackExpiryDays, setCashbackExpiryDays] = useState<number | ''>('');
  const [cashbackMaxUsagePercent, setCashbackMaxUsagePercent] = useState<number | ''>('');
  const [whatsappMessageTemplate, setWhatsappMessageTemplate] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        setPrefixLength(d.prefixLength);
        setRequireSku(d.requireSku);
        setCashbackPercent(d.cashbackPercent);
        setCashbackExpiryDays(d.cashbackExpiryDays);
        setCashbackMaxUsagePercent(d.cashbackMaxUsagePercent);
        setWhatsappMessageTemplate(d.whatsappMessageTemplate);
      });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        masterPassword,
        prefixLength: Number(prefixLength),
        requireSku,
        cashbackPercent: Number(cashbackPercent),
        cashbackExpiryDays: Number(cashbackExpiryDays),
        cashbackMaxUsagePercent: Number(cashbackMaxUsagePercent),
        whatsappMessageTemplate,
      }),
    });
    setSaved(true);
  }

  return (
    <main className="mx-auto max-w-xl p-4 sm:p-8">
      <PageHeading>Configurações</PageHeading>
      <form onSubmit={save} className="flex flex-col gap-4">
        <p className="text-sm text-ink/60">Programa de cashback — válido só para a loja atual</p>

        <label className="text-lg font-medium" htmlFor="cashbackPercent">
          Percentual de cashback (%)
        </label>
        <input
          id="cashbackPercent"
          type="number"
          min={0}
          max={100}
          step="0.01"
          value={cashbackPercent}
          onChange={(e) => {
            setCashbackPercent(e.target.value === '' ? '' : Number(e.target.value));
            setSaved(false);
          }}
          className="rounded-lg border border-gray-300 px-3 py-3 text-base focus:border-accent focus:ring-2 focus:ring-accent/40 focus:outline-none"
        />

        <label className="text-lg font-medium" htmlFor="cashbackExpiryDays">
          Prazo de validade do cashback (dias)
        </label>
        <input
          id="cashbackExpiryDays"
          type="number"
          min={5}
          max={3650}
          value={cashbackExpiryDays}
          onChange={(e) => {
            setCashbackExpiryDays(e.target.value === '' ? '' : Number(e.target.value));
            setSaved(false);
          }}
          className="rounded-lg border border-gray-300 px-3 py-3 text-base focus:border-accent focus:ring-2 focus:ring-accent/40 focus:outline-none"
        />

        <label className="text-lg font-medium" htmlFor="cashbackMaxUsagePercent">
          Cashback cobre no máximo (%) do valor da nova compra
        </label>
        <p className="text-sm text-ink/60">
          Ex.: com 20%, um cliente com R$ 50 de crédito só consegue usar o valor todo numa compra de R$ 250 ou mais —
          em compras menores, o desconto fica limitado a esse percentual do valor da compra.
        </p>
        <input
          id="cashbackMaxUsagePercent"
          type="number"
          min={0.01}
          max={100}
          step="0.01"
          value={cashbackMaxUsagePercent}
          onChange={(e) => {
            setCashbackMaxUsagePercent(e.target.value === '' ? '' : Number(e.target.value));
            setSaved(false);
          }}
          className="rounded-lg border border-gray-300 px-3 py-3 text-base focus:border-accent focus:ring-2 focus:ring-accent/40 focus:outline-none"
        />

        <label className="text-lg font-medium" htmlFor="whatsappMessageTemplate">
          Mensagem enviada pelo WhatsApp
        </label>
        <p className="text-sm text-ink/60">
          Use %nome%, %loja%, %dia%, %cashback%, %data_limite%, %limite_uso% e %compra_minima% — cada um é trocado
          automaticamente. %loja% vira o nome desta loja. Válido só para o envio manual (link do WhatsApp); se um dia
          o modo automático (API da Meta) estiver ligado, o texto exato enviado é o aprovado no painel da Meta.
        </p>
        <textarea
          id="whatsappMessageTemplate"
          rows={10}
          value={whatsappMessageTemplate}
          onChange={(e) => {
            setWhatsappMessageTemplate(e.target.value);
            setSaved(false);
          }}
          className="rounded-lg border border-gray-300 px-3 py-3 text-base focus:border-accent focus:ring-2 focus:ring-accent/40 focus:outline-none"
        />

        <Button type="submit" size="sm" icon={<CheckIcon />}>
          Salvar
        </Button>
        {saved && <p className="text-lg text-green-600">Salvo!</p>}
      </form>
    </main>
  );
}
