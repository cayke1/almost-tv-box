package com.tvos.remote

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log

class DiscoveryManager(
    context: Context,
    private val onServiceFound: (String, Int) -> Unit
) {
    private val nsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val serviceType = "_http._tcp"
    private val targetServiceName = "TV-OS-Server"

    private val discoveryListener = object : NsdManager.DiscoveryListener {
        override fun onDiscoveryStarted(regType: String) {
            Log.d("NSD", "Discovery started")
        }

        override fun onServiceFound(service: NsdServiceInfo) {
            Log.d("NSD", "Service found: ${service.serviceName} (${service.serviceType})")
            if (service.serviceType.contains(serviceType) && service.serviceName.contains(targetServiceName)) {
                nsdManager.resolveService(service, resolveListener)
            }
        }

        override fun onServiceLost(service: NsdServiceInfo) {
            Log.e("NSD", "Service lost: $service")
        }

        override fun onDiscoveryStopped(regType: String) {
            Log.i("NSD", "Discovery stopped: $regType")
        }

        override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
            Log.e("NSD", "Start Discovery failed: Error code: $errorCode")
            nsdManager.stopServiceDiscovery(this)
        }

        override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
            Log.e("NSD", "Stop Discovery failed: Error code: $errorCode")
            nsdManager.stopServiceDiscovery(this)
        }
    }

    private val resolveListener = object : NsdManager.ResolveListener {
        override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
            Log.e("NSD", "Resolve failed: $errorCode")
        }

        override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
            Log.d("NSD", "Resolve Succeeded. $serviceInfo")
            val host = serviceInfo.host.hostAddress ?: "127.0.0.1"
            val port = serviceInfo.port
            onServiceFound(host, port)
        }
    }

    fun startDiscovery() {
        nsdManager.discoverServices(serviceType, NsdManager.PROTOCOL_DNS_SD, discoveryListener)
    }

    fun stopDiscovery() {
        try {
            nsdManager.stopServiceDiscovery(discoveryListener)
        } catch (e: Exception) {
            Log.e("NSD", "Stop discovery failed", e)
        }
    }
}
