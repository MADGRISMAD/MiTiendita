<template>
  <router-view></router-view>
</template>

<script>
export default {
  name: 'App'
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
