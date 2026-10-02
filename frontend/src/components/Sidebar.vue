<template>
  <div class="flex flex-col w-16 bg-white text-gray-800 min-h-screen border-r border-gray-200">
    <div class="flex items-center justify-center py-4">
      <img
        :src="logoSrc"
        alt="Mi Tiendita"
        class="w-9 h-9 rounded-lg object-cover"
      />
    </div>

    <nav class="flex flex-col space-y-6 flex-1 py-4 items-center">
      <router-link
        to="/main"
        :class="[
          'flex items-center justify-center w-10 h-10 rounded-md hover:bg-gray-100',
          $route.path === '/main' ? 'bg-gray-200' : '',
        ]"
        title="Mesas"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 text-gray-800">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </router-link>

      <router-link
        to="/meseros"
        :class="[
          'flex items-center justify-center w-10 h-10 rounded-md hover:bg-gray-100',
          $route.path === '/meseros' ? 'bg-gray-200' : '',
        ]"
        title="Menú"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 text-gray-800">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.75v10.5m-5.25-7.5h10.5M6.75 16.5h10.5" />
        </svg>
      </router-link>

      <router-link
        to="/setup"
        :class="[
          'flex items-center justify-center w-10 h-10 rounded-md hover:bg-gray-100',
          $route.path === '/setup' ? 'bg-gray-200' : '',
        ]"
        title="Configuración"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 text-gray-800">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.992l-1.003-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      </router-link>
    </nav>
  </div>
</template>

<script>
import { venueStore } from "../venueStore";

export default {
  name: "Sidebar",
  computed: {
    logoSrc() {
      return venueStore.logoUrl || "/logo.svg";
    },
  },
  methods: {
    logout() {
      this.$router.push("/");
    },
  },
};
</script>
