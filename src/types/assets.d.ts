// Vite `?raw` 资源导入的类型声明。
// WXT 不会为 *.html?raw 生成类型,这里补一份最小的即可。
declare module '*.html?raw' {
  const content: string
  export default content
}
