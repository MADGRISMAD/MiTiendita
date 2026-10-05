<template>
  <div class="pf-card-stack">
    <p v-if="!detail.clientsList.length" class="adm-empty">
      <strong>Aún no tiene clientes.</strong><br />
      Cuando una tienda se registre con el código <strong>{{ detail.code }}</strong> aparece aquí.
    </p>
    <div v-else class="pf-table-wrap">
      <table class="pf-table">
        <thead>
          <tr>
            <th scope="col">Tienda</th>
            <th scope="col">Estado</th>
            <th scope="col">Plan</th>
            <th scope="col">Llegó</th>
            <th scope="col" class="num">Ha pagado</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in detail.clientsList" :key="c.id">
            <td>
              <div class="who">
                <ClientAvatar :name="c.businessName" />
                <router-link :to="{ name: 'platformClient', params: { id: c.id } }"><strong>{{ c.businessName }}</strong></router-link>
              </div>
            </td>
            <td><StatusPill :client="c" /></td>
            <td>{{ PLAN[c.plan] || c.plan }}</td>
            <td>{{ shortDate(c.referredAt) }}</td>
            <td class="num">{{ c.billed ? money(c.billed) : "—" }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import ClientAvatar from "./ClientAvatar.vue";
import StatusPill from "./StatusPill.vue";
import { money, shortDate } from "../../platform/format";

defineProps({ detail: { type: Object, required: true } });
const PLAN = { basic: "Básico", growth: "Crecimiento", pro: "Pro", perpetual: "Perpetua" };
</script>
