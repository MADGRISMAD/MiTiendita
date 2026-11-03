<template>
  <router-view></router-view>
  <BrandLoader />
  <AppDialogHost />
  <RegisterPickerDialog />
  <CutConfirmDialog />
</template>

<script>
import BrandLoader from './components/BrandLoader.vue'
import AppDialogHost from './components/AppDialogHost.vue'
import RegisterPickerDialog from './components/RegisterPickerDialog.vue'
import CutConfirmDialog from './components/CutConfirmDialog.vue'

export default {
  name: 'App',
  components: { BrandLoader, AppDialogHost, RegisterPickerDialog, CutConfirmDialog }
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
