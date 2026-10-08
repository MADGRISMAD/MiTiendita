<template>
  <router-view></router-view>
  <BrandLoader />
</template>

<script>
import BrandLoader from './components/BrandLoader.vue'

export default {
  name: 'App',
  components: { BrandLoader }
}
</script>

<style>
html, body, #app {
  height: 100%;
  height: 100dvh;
  margin: 0;
}
#app {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
</style>
