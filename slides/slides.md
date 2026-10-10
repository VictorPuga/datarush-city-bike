---
theme: default
title: City Bike Rebalancer
info: Pitch DataRush City Bike
class: text-center
drawings:
  persist: false
transition: slide-left
comark: true
duration: 5min
---

<img class="cover-bg" src="/cover.jpeg" />
<div class="cover-overlay"></div>

<div class="cover-text">

# City Bike Rebalancer

## Cuántas bicis mover, a qué estación y cuándo

<div class="mt-12 text-sm">DataRush · Citi Bike NYC · Víctor Puga y Eduardo Porto</div>

</div>

<div class="credit credit-cover">Foto: Jer Rey, Pexels</div>

<!--
(0:00–0:10) Somos [equipo]. Les mostramos una herramienta para que operaciones de Citi Bike deje de reaccionar y empiece a planear.
-->

---

# Una estación vacía es un viaje que no ocurre

<div class="grid grid-cols-5 gap-8 mt-8 text-left items-center">
<div class="col-span-3">

<div class="grid grid-cols-2 gap-6">
<div class="card">

### Estación vacía
El usuario no puede **iniciar** su viaje.

</div>
<div class="card">

### Estación llena
El usuario no puede **terminarlo**.

</div>
</div>

<div class="mt-8">

Rebalancear cuesta vehículos, personal y tiempo.
Hoy es **reactivo**.
Queremos que sea **planeado**.

</div>
</div>
<div class="col-span-2 photo">
<img src="/photo.jpeg" />
<div class="credit">Foto: adam roye, Unsplash</div>
</div>
</div>

<!--
(0:10–0:35) La demanda no es uniforme: de mañana fluye de zonas residenciales a oficinas, de tarde al revés. Rebalancear es caro y hoy se hace reaccionando.
-->

---

# Habilitamos a Operaciones para decidir

<div class="grid grid-cols-3 gap-6 mt-10 text-left">
<div class="card">

### Cuántas
Bicis clásicas y eléctricas que habrá en cada estación en un periodo dado.

</div>
<div class="card">

### Dónde
Distinguimos estaciones y barrios para ver dónde faltarán.

</div>
<div class="card">

### Cuándo
Planear el rebalanceo antes de que las bicis falten.

</div>
</div>

<div class="mt-8 text-lg font-semibold">Pasamos de reaccionar a planear el rebalanceo.</div>

<!--
(0:35–0:50) Al identificar el problema, impulsamos la solución con Machine Learning.
Armamos un sistema de pronóstico completo que dice cuántas bicicletas clásicas y eléctricas habrá en cada estación en un periodo determinado, distinguiendo los lugares donde se encuentran.
Nuestro objetivo es dejar de reaccionar solo a viajes pasados y planear el rebalanceo de forma inteligente.
-->

---

# Cómo lo construimos

<div class="grid grid-cols-3 gap-6 mt-10 text-left">
<div class="card">

### Datos
12 tablas mensuales con Nueva York en común, limpias y con clima por hora.

</div>
<div class="card">

### Modelo
Definimos entradas y salidas, y entrenamos en PyTorch hasta una red factorizada.

</div>
<div class="card">

### Dashboard
Estaciones agrupadas por barrios oficiales de NYC Open Data.

</div>
</div>

<div class="grid grid-cols-3 gap-6 mt-8">
<div class="card"><div class="big">21%</div>de error por estación-día</div>
<div class="card"><div class="big">2,515</div>estaciones pronosticadas cada 15 min</div>
<div class="card"><div class="big">84%</div>de cobertura del intervalo de 80%</div>
</div>

<!--
(2:15–3:00) Construimos el modelo a partir de 12 tablas, con Nueva York como localidad en común.
Primero hicimos un análisis y limpieza de datos: quitamos outliers, nulos y variables de baja correlación que no aportaban densidad a la red.
Añadimos un factor diferencial: el clima de cada momento exacto, alineado por tiempo, y normalizamos los datos.
Definimos la estructura de entrada y salida: con la información precisa del día, pronosticamos entradas y salidas por tipo de bicicleta para cada estación.
Todo reproducible desde los CSV crudos, con semilla fija.
Entradas: 12 CSV mensuales de Citi Bike (oct 2025 a sep 2026), 262 barrios NTA 2020 (NYC Open Data), clima por hora (Open-Meteo) y festivos federales.
Proceso: limpieza de nulos, duración, coordenadas, estaciones de prueba y duplicados (45.2 M viajes); tabla estación × 15 min con 2,515 estaciones y 81 M de filas; `extract_stations.py` y `assign_regions.py` para estación → barrio; modelo exportado a ONNX y dashboard Next.js.
Iteramos el modelo varias veces; la versión final es una red factorizada con binomial negativa.
Resultados en el bloque de prueba (17 a 30 sep, no usado para elegir nada): 21% de error por estación-día y 47% por estación-hora, contra 33% y 57% del baseline (perfil histórico de la estación ajustado al nivel reciente). Eso es −37.5% y −17.5%.
El error es la suma de errores absolutos entre la suma de salidas (WAPE).
Validación temporal: se entrena con el pasado y se prueba en las dos últimas semanas.
La tarea es salidas y llegadas por estación cada 15 min, clásicas y eléctricas. Sin lags: predice cualquier fecha con calendario y pronóstico de clima. Las estaciones nuevas se pronostican por barrio y coordenadas.
El intervalo de 80% por estación y hora está calibrado: por día-estación cubre 84%.
Las 924 estaciones más usadas (84% de los viajes) se pronostican con 19% de error por día.
Límite: los datos solo registran la demanda satisfecha. Una estación vacía no genera viajes que contar. En las 377 estaciones de menos de 5 salidas al día, el intervalo importa más que el punto.
-->

---

# Arquitectura del modelo

<img src="/forecast_vs_real_es.png" class="mt-2 mx-auto rounded-xl" style="max-height:250px" />

<div class="grid grid-cols-3 gap-4 mt-4 text-left text-sm">
<div class="card">

### Hora
Una red neuronal chica lee calendario y clima de cada intervalo de 15 min. El clima pesa más.

</div>
<div class="card">

### Estación
Embedding propio, de barrio y coordenadas. Pronostica estaciones nuevas.

</div>
<div class="card">

### Binomial negativa
Da la tasa esperada y la incertidumbre. Mismo pronóstico que Poisson, intervalos realistas.

</div>
</div>

<!--
(0:50–1:30) Entrenamos y evaluamos el modelo con PyTorch, ajustando capas y arquitectura de la red neuronal.
Así vimos que el clima es el diferenciador principal para ajustar los pesos del modelo.
Una red neuronal chica separa lo que depende de la hora de lo que depende de la estación: log mu = b[s,c] + g0[t,c] + suma de U[s,r,c] * G[t,r,c].
Una red toma el calendario y el clima del intervalo (13 entradas) y produce g0 y G una sola vez por intervalo. Es la única parte con capas ocultas.
Cada estación aporta su sesgo b y 24 factores U, a partir de un embedding libre, uno de su barrio y sus coordenadas. Por eso funciona con estaciones nuevas sin historia.
Cada celda cuesta un producto punto, así que entrenar toma unos 6 minutos en CPU. Se exporta a ONNX (1.2 MB) y el dashboard lo ejecuta con `onnxruntime-node`.
La gráfica: salidas y llegadas totales de la ciudad cada 15 minutos en el periodo de prueba, R² de 0.891 y 0.888.
Poisson supone varianza igual a la media. La demanda varía más (lluvia, eventos, estaciones fuera de servicio), así que usamos binomial negativa: varianza = mu + alpha * mu^2, con alpha por serie, tasa y estación.
Optimizaciones: dropout 0.2, LayerNorm y GELU en el MLP de contexto; ruido en el clima al entrenar; decaimiento de pesos 5 veces mayor en estaciones; AdamW con coseno, recorte de gradiente y promedio móvil de pesos.
-->

---

# Nuestro valor agregado: el clima

<img src="/findings_weather_es.png" class="mt-2 mx-auto rounded-xl" style="max-height:180px" />

<div class="grid grid-cols-3 gap-6 mt-6">
<div class="card"><div class="big">−47%</div>de viajes con lluvia moderada</div>
<div class="card"><div class="big">+30%</div>de viajes por cada +10 °C</div>
<div class="card"><div class="big">1.5x</div>error máximo del modelo en tormenta, contra 4.5x del perfil histórico</div>
</div>

<div class="mt-4 text-lg font-semibold">El clima convierte un pronóstico histórico en una decisión de mañana.</div>

<!--
(1:30–2:15) Como valor agregado incorporamos el clima, porque las condiciones afectan la cantidad de viajes.
Con los resultados agrupamos estaciones cercanas en barrios definidos con la data oficial de NYC Open Data, y eso es lo que mostramos ahora en el dashboard.
Una de las cosas que encontramos: la lluvia moderada baja la demanda de bicicletas 47%.
Nuestro pronóstico ya lo incluye, así que no solo repite el pasado.
Se compara cada hora con horas secas del mismo mes, tipo de día y hora.
Lluvia ligera, moderada y fuerte: −22%, −47% y −59% de viajes, y el pico de la mañana cae más (−62% con lluvia moderada).
Cada +10 °C: +30% de viajes, y +48% entre usuarios ocasionales contra +27% entre socios.
Con 11 a 50 mm de lluvia el perfil histórico se pasa hasta 4.5x y el modelo hasta 1.5x.
El modelo sigue la caída, pero con tormentas muy fuertes todavía se pasa.
Un operador que ignora el clima manda camiones a reponer estaciones que ese día no se van a vaciar.
-->

---

# Demo: el dashboard

<!--
(3:00–4:00) Demo en vivo: elegir fecha y hora, abrir un barrio, abrir una estación, mostrar el intervalo.
Aquí vemos la cantidad de bicicletas alrededor de la ciudad a una fecha y hora dada.
También vemos cuántas salidas y llegadas hay; por ejemplo, más salidas durante la mañana.
Podemos verlo por barrio y por estación.
Eso nos da métricas de la cantidad de bicis en cada estación durante el día, y nos ayuda a decidir cuáles mover.
Además hay gráficas con información relevante: el flujo de bicicletas durante la semana, las diferencias entre días y la demanda.
Podemos predecir, por ejemplo, dentro de dos semanas, un día entre semana, y ver cuándo habrá más flujo durante todo el día.
La respuesta es casi instantánea.
Anticipamos los pronósticos con intervalos calibrados de 15 minutos para saber si faltarán o sobrarán bicis.
Mapa por barrio, estaciones desde zoom 16.
Pronóstico de 24 horas por estación con intervalo de 80% calibrado.
Flujo neto: qué barrios ganan o pierden bicis en la siguiente hora.
El API ejecuta el modelo ONNX con `onnxruntime-node` y clima en vivo.
-->

---

# Conclusión

<div class="grid grid-cols-3 gap-6 mt-8 text-left">
<div class="card">

### Anticipamos
Pronósticos por estación y hora, con intervalos calibrados, para saber dónde faltarán o sobrarán bicis.

</div>
<div class="card">

### Incorporamos el clima
Lluvia moderada baja la demanda **47%**. Nuestro pronóstico ya lo incluye.

</div>
<div class="card">

### Operamos
Un dashboard que provee información para que un proveedor pueda organizar el inventario de las estaciones.

</div>
</div>

<div class="mt-10 text-3xl font-bold">Dejar de reaccionar. Empezar a planear.</div>

<div class="mt-4 text-sm opacity-70">Siguiente paso: un segundo año de datos, inventario en tiempo real con GBFS y rutas de rebalanceo.</div>

<!--
(4:00–5:00) Cierre firme. Repetir el mensaje: cada estación vacía es un viaje perdido, y hoy podemos verla venir.
Construimos un dashboard que provee información para que un proveedor pueda organizar el inventario de las estaciones.
Con este proyecto podemos dejar de reaccionar a datos del pasado y empezar a planear con datos del futuro sobre cómo organizar el sistema de bicicletas.
Siguientes pasos: agregar más años de datos para tener un modelo más completo (hoy el modelo se queda corto en días fríos y se pasa en tormentas), inventario en tiempo real con GBFS para medir el stock y no solo el flujo, y optimización de camiones y turnos.
-->
