import cookies from './util.cookies'
import db from './util.db'
import log from './util.log'

// 菜单路由 初始化需要
import Vue from 'vue'
import router from '@/router/index'
import store from '@/store/index'
import layoutHeaderAside from '@/layout/header-aside'
import { cloneDeep } from 'lodash'
import { frameInRoutes } from '@/router/routes'
import { Notification, MessageBox, Loading } from 'element-ui'
import { checkDb } from '@api/sys.user'
import { CreateDrop } from '@api/sys.base'

const util = {
  cookies,
  db,
  log
}

/**
 * @description 更新标题
 * @param {String} title 标题
 */
util.title = function (titleText) {
  const processTitle = process.env.VUE_APP_TITLE || 'chubby-admin'
  window.document.title = `${processTitle}${titleText ? ` | ${titleText}` : ''}`
}

/**
 * @description 打开新页面
 * @param {String} url 地址
 */
util.open = function (url) {
  var a = document.createElement('a')
  a.setAttribute('href', url)
  a.setAttribute('target', '_blank')
  a.setAttribute('id', 'chubby-link-temp')
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(document.getElementById('chubby-link-temp'))
}

function componentToImport (ary) {
  ary.forEach(i => {
    if (i.componentPath != 'layout/header-aside') {
      let component = () => import('@/pages/' + i.componentPath)
      i.component = component
    } else {
      i.component = layoutHeaderAside
    }

    if (i.children) {
      componentToImport(i.children)
    }
  })
}

/**
 * @description 动态加载路由
 * @param {Object} r 路由
 */
util.initRoute = function (r) {
  let data = cloneDeep(r), route = [
    {
      path: '/',
      component: layoutHeaderAside
    },
    { path: '*', redirect: '/404', hidden: true }
  ]

  componentToImport(data)

  let routes = route.concat(data)
  router.$addRoutes(routes)
  // 更新标签页池
  store.commit('chubby/page/init', [
    ...frameInRoutes,
    ...routes
  ])
}

/**
 * @description 动态加载菜单
 * @param {Object} m 菜单
 */
util.initMenu = function (m, isAll = false) {
  let params = isAll ? util.dealData(cloneDeep(m)) : m
  store.commit('chubby/menu/asideSet', params.menu)

  if (isAll) {
    Notification({
      title: '提示',
      message: '动态加载菜单成功',
      type: 'success',
      offset: 100
    })
    let info = store.getters['chubby/user/info']
    store.dispatch('chubby/user/set', {
      user: info.user,
      menus: params,
      interfaces: info.interfaces
    }, { root: true })
  }
  util.initRoute(params.route)
}

/**
 * @description 更新接口列表
 * @param {Object} m 菜单
 */
util.initInterface = function (f) {
  let info = store.getters['chubby/user/info']
  store.dispatch('chubby/user/set', {
    user: info.user,
    menus: info.menus,
    interfaces: f
  }, { root: true })
}

/**
 * @description 获取菜单树
 */
util.getMenuTree = function (isGet, params) {
  if (isGet) {
    return cloneDeep(store.getters['chubby/user/menus'].menu)
  } else {
    let data = []
    while (params.length > 0) {
      for (let i = 0; i < params.length; i++) {
        if (params[i].menu_id == undefined) {
          params.splice(i, 1)
          i--
          continue
        }

        if (params[i].pid == 0) {
          data.push(params[i])
          params.splice(i, 1)
          i--
        } else {
          let index = data.findIndex(item => item.menu_id === params[i].pid)
          if (index == -1) continue
          if (!data[index]['children']) data[index]['children'] = []
          data[index]['children'].push(params[i])
          params.splice(i, 1)
          i--
        }
      }
    }
    return data
  }
}

/**
 * @description 更新个人信息
 * @param {Object} u 数据
 */
util.updateUserInfo = function (u) {
  let info = cloneDeep(store.getters['chubby/user/info'])

  store.dispatch('chubby/user/set', {}, { root: true })

  util.cookies.set('token', u.token)
  util.cookies.set('password', u.user.password)

  store.dispatch('chubby/user/set', {
    user: u.user,
    menus: info.menus,
    interfaces: info.interfaces
  }, { root: true })
}

let getRouteInfo = (params) => {
  return {
    id: params.menu_id,
    name: params.name,
    path: params.path,
    meta: {
      title: params.title,
      cache: params.cache,
      auth: true,
      is_disabled: params.is_disabled
    },
    componentPath: params.componentPath
  }
}

let getMenuInfo = (params) => {
  return {
    title: params.title,
    icon: params.icon,
    id: params.menu_id,
    path: params.path,
    is_disabled: params.is_disabled
  }
}

/**
 * @description 菜单路由初始化处理
 * @param {Object} params 数据
 */
util.dealData = function (params) {
  let data = {
    route: [],
    menu: []
  }
  while (params.length > 0) {
    for (let i = 0; i < params.length; i++) {
      if (params[i].menu_id == undefined) {
        params.splice(i, 1)
        i--
        continue
      }

      if (params[i].pid == 0) {
        data.menu.push(getMenuInfo(params[i]))
        data.route.push(getRouteInfo(params[i]))
        params.splice(i, 1)
        i--
      } else {
        let index = data.menu.findIndex(item => item.id === params[i].pid)
        if (index == -1) continue
        if (!data.menu[index]['children']) data.menu[index]['children'] = []
        if (!data.route[index]['children']) data.route[index]['children'] = []
        data.menu[index]['children'].push(getMenuInfo(params[i]))
        data.route[index]['children'].push(getRouteInfo(params[i]))
        params.splice(i, 1)
        i--
      }
    }
  }
  return data
}

/**
 * @description 检测是否初始化过数据库
 */
util.isInitialized = function () {
  if (!store.getters['chubby/user/isInit']) {
    checkDb({})
      .then(async res => {
        store.commit('chubby/user/setInit', res)

        if (!res) MessageBox.alert('系统暂不能正常使用, 是否初始化数据库', '重要提示', {
          confirmButtonText: '确定',
          showClose: false,
          callback: action => {
            sys_to_init()
          }
        })
      })
  }
}

function sys_to_init () {
  let loadingInstance = Loading(Vue.loadOption('系统初始化中，请耐心等待.....'))

  CreateDrop({})
    .then(async res => {
      loadingInstance.close()
      store.commit('chubby/user/setInit', true)
      Notification({
        type: 'success',
        title: '初始化数据库成功',
        offset: 100,
        duration: 5000,
        dangerouslyUseHTMLString: true,
        message: '<div>管理员: ' + res.username + '<div><div>初始密码：' + res.password + '<div>',
        showClose: false
      })
    })
    .catch(() => {
      loadingInstance.close()
      MessageBox.alert('初始化失败，点击重新初始化', '错误提示', {
        confirmButtonText: '确定',
        showClose: false,
        callback: action => {
          this.init()
        }
      })
    })
}

export default util
