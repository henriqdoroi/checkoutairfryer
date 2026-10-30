import React, { useEffect, useLayoutEffect, useState } from "react";
import { Check, Loader2, MapPin } from "lucide-react";
import {
  Address,
  Billing,
  digits,
  isValidCpf,
  isValidEmail,
  maskCep,
  maskCpf,
  maskPhone,
} from "./lib";
import { Field, Sheet, keepVisible, s } from "./ui";

// sem "piscar" o conteúdo antigo ao abrir a folha (useEffect pinta antes)
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

export const EMPTY_ADDRESS: Address = {
  recipient: "",
  cep: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
};

/** Mesmas regras do servidor (src/compat/store-checkout.ts). */
export function addressErrors(a: Address): Partial<Record<keyof Address, string>> {
  const e: Partial<Record<keyof Address, string>> = {};
  if (digits(a.cep).length !== 8) e.cep = "CEP com 8 números.";
  if (!a.street.trim()) e.street = "Informe a rua.";
  if (!a.number.trim()) e.number = "Informe o número (ou S/N).";
  if (!a.district.trim()) e.district = "Informe o bairro.";
  if (!a.city.trim()) e.city = "Informe a cidade.";
  if (!UFS.includes(a.state.toUpperCase())) e.state = "UF";
  return e;
}

export function addressLine(a: Address) {
  return `${a.street} ${a.number}`.trim() + (a.cep ? ` - CEP ${digits(a.cep)}` : "");
}

/* ---------------- endereço ---------------- */

export function AddressSheet({
  open,
  onClose,
  addresses,
  selected,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  addresses: Address[];
  selected: number;
  onSave: (a: Address, index: number | null) => void;
}) {
  const [form, setForm] = useState<Address>(EMPTY_ADDRESS);
  const [touched, setTouched] = useState(false);

  useIsoLayoutEffect(() => {
    if (!open) return;
    setTouched(false);
    setForm(addresses[selected] ?? EMPTY_ADDRESS);
    window.setTimeout(() => document.getElementById("addr-number")?.focus(), 80);
  }, [open, addresses, selected]);

  const errors = addressErrors(form);
  const show = (k: keyof Address) => (touched ? errors[k] : null);

  const save = () => {
    setTouched(true);
    if (Object.keys(errors).length) {
      document.getElementById("addr-number")?.focus();
      return;
    }
    onSave(
      { ...form, cep: maskCep(form.cep), state: form.state.toUpperCase(), street: form.street.trim(), number: form.number.trim() },
      selected,
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Número da casa"
      footer={
        <button type="button" className={s.btn} onClick={save}>
          <Check size={18} /> Usar este endereço
        </button>
      }
    >
      <form
        className={s.form}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        noValidate
      >
        <div className={s.option} style={{ cursor: "default", marginBottom: 16 }}>
          <MapPin size={20} color="var(--sc-brand)" />
          <span className={s.optionBody}>
            <span className={s.optionTitle} style={{ display: "block", fontWeight: 600 }}>{form.street}</span>
            <span className={s.optionSub} style={{ display: "block" }}>{[form.district, `${form.city}/${form.state}`, `CEP ${digits(form.cep)}`].filter(Boolean).join(" · ")}</span>
          </span>
        </div>
        <Field label="Número da casa" htmlFor="addr-number" error={show("number")}>
          <input
            id="addr-number"
            className={s.input}
            value={form.number}
            onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
            onFocus={keepVisible}
            inputMode="text"
            autoComplete="address-line2"
            placeholder="Ex.: 94 ou S/N"
            aria-invalid={!!show("number")}
            aria-describedby={show("number") ? "addr-number-err" : undefined}
          />
        </Field>
        <button type="submit" className={s.srOnly} tabIndex={-1}>
          Salvar
        </button>
      </form>
    </Sheet>
  );
}

/* ---------------- faturamento ---------------- */

export type BillingFields = { nome: boolean; email: boolean; cpf: boolean; celular: boolean };

export function billingErrors(b: Billing, f: BillingFields): Partial<Record<keyof Billing, string>> {
  const e: Partial<Record<keyof Billing, string>> = {};
  if (f.nome && b.name.trim().split(/\s+/).length < 2) e.name = "Informe nome e sobrenome.";
  if (f.email && !isValidEmail(b.email)) e.email = "E-mail inválido.";
  if (f.cpf && !isValidCpf(b.cpf)) e.cpf = "CPF inválido.";
  if (f.celular && digits(b.phone).length < 10) e.phone = "Celular com DDD.";
  return e;
}

export function BillingSheet({
  open,
  onClose,
  fields,
  value,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  fields: BillingFields;
  value: Billing;
  onSave: (b: Billing) => void;
}) {
  const [form, setForm] = useState<Billing>(value);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (open) {
      setForm(value);
      setTouched(false);
    }
  }, [open, value]);

  const errors = billingErrors(form, fields);
  const show = (k: keyof Billing) => (touched ? errors[k] : null);
  const save = () => {
    setTouched(true);
    const first = (["name", "email", "cpf", "phone"] as const).find((k) => errors[k]);
    if (first) {
      document.getElementById(`bill-${first}`)?.focus();
      return;
    }
    onSave({ ...form, name: form.name.trim(), email: form.email.trim() });
  };
  const common = (k: keyof Billing) => ({
    id: `bill-${k}`,
    className: s.input,
    value: form[k],
    onFocus: keepVisible,
    "aria-invalid": !!show(k),
    "aria-describedby": show(k) ? `bill-${k}-err` : undefined,
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Dados de faturamento"
      footer={
        <button type="button" className={s.btn} onClick={save}>
          <Check size={18} /> Salvar dados
        </button>
      }
    >
      <form
        className={s.form}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {fields.nome && (
          <Field label="Nome completo" htmlFor="bill-name" error={show("name")}>
            <input {...common("name")} autoComplete="name" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
        )}
        {fields.cpf && (
          <Field label="CPF" htmlFor="bill-cpf" error={show("cpf")}>
            <input
              {...common("cpf")}
              inputMode="numeric"
              placeholder="000.000.000-00"
              onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })}
            />
          </Field>
        )}
        {fields.email && (
          <Field label="E-mail" htmlFor="bill-email" error={show("email")} hint="Enviaremos a confirmação do pedido.">
            <input
              {...common("email")}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="nome@email.com"
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
        )}
        {fields.celular && (
          <Field label="Celular" htmlFor="bill-phone" error={show("phone")}>
            <input
              {...common("phone")}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="(11) 91234-5678"
              onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })}
            />
          </Field>
        )}
        <button type="submit" className={s.srOnly} tabIndex={-1}>
          Salvar
        </button>
      </form>
    </Sheet>
  );
}

/* ---------------- cupom ---------------- */

export function CouponSheet({
  open,
  onClose,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  /** Valida no servidor; devolve a mensagem de erro (ou null se aplicou). */
  onApply: (code: string) => Promise<string | null>;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setCode("");
      setError(null);
    }
  }, [open]);

  const apply = async () => {
    const c = code.trim();
    if (!c) {
      setError("Digite o código do cupom.");
      return;
    }
    setBusy(true);
    const err = await onApply(c);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Cupom de desconto"
      footer={
        <button type="button" className={s.btn} onClick={apply} disabled={busy}>
          {busy ? <Loader2 size={18} className={s.spin} /> : null}
          {busy ? "Validando..." : "Aplicar cupom"}
        </button>
      }
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <Field label="Código do cupom" htmlFor="coupon-code" error={error}>
          <input
            id="coupon-code"
            className={s.input}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().replace(/\s/g, ""));
              setError(null);
            }}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={30}
            placeholder="EX.: PRIMEIRACOMPRA"
            aria-invalid={!!error}
          />
        </Field>
      </form>
    </Sheet>
  );
}
