/**
 * Pinia 类型声明
 * @description 临时类型声明文件，解决 pinia 未安装时的类型错误
 * TODO: 安装 pinia 后可删除此文件
 */

declare module 'pinia' {
  import { defineStore as vueDefineStore } from '@vue/runtime-core';

  export function defineStore(id: string, setup: () => any): any;
  export function defineStore(id: string, options: any): any;
  export function defineStore(id: string, setup: any, options: any): any;
  export function createPinia(): any;
  export function storeToRefs(store: any): any;
}
