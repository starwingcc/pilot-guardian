import { registerController } from '../src/runtime/controller'

export default defineBackground(() => {
  registerController()
})

