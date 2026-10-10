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

# La decisión concreta

<div class="grid grid-cols-3 gap-6 mt-10 text-left">
<div class="card">

### Operaciones
**Cuántas** bicis mover a **qué estación** y **cuándo**.

</div>
<div class="card">

### Planeadores urbanos
Dónde ampliar o reubicar estaciones.

</div>
<div class="card">

### Usuarios
Una bici y un anclaje cuando los necesitan.

</div>
</div>

<!--
(0:35–0:50) Quién se beneficia y con qué decisión. Nivel estación-hora, porque ahí se opera.
Con la cantidad de bicis que habrá en cada estación durante el día, el operador decide cuáles bicis mover y a dónde.
-->

---

# Arquitectura del modelo

<div class="grid grid-cols-5 gap-3 mt-10 items-stretch text-left text-sm">
<div class="card">

### Hora
Calendario y clima de cada intervalo de 15 min.

</div>
<div class="card">

### Estación
Embedding propio, de barrio y coordenadas.

</div>
<div class="card">

### Producto punto
Factores de la hora × factores de la estación.

</div>
<div class="card">

### Binomial negativa
Tasa esperada y dispersión de cada celda.

</div>
<div class="card">

### Intervalos
Choques compartidos de día, hora y barrio.

</div>
</div>

<div class="grid grid-cols-2 gap-6 mt-8 text-left text-sm">
<div class="card">

### Entradas
- **Calendario:** hora del día, día de la semana, fin de semana, festivo
- **Clima:** temperatura, humedad, viento, lluvia, lluvia de las 2 horas previas y tipo de clima

</div>
<div class="card">

### Salidas, por estación cada 15 min
- **Tasa esperada** de bicis (`lambda`) y **dispersión** (`alpha`)
- Para salidas y llegadas, clásicas y eléctricas: 4 series por estación

</div>
</div>

<!--
(0:50–1:30) Una red neuronal chica que separa lo que depende de la hora de lo que depende de la estación.
Para la estación s, el intervalo t y el objetivo c (salidas y llegadas, clásicas y eléctricas): log mu = b[s,c] + g0[t,c] + suma de U[s,r,c] * G[t,r,c].
Una red toma el calendario y el clima del intervalo (13 entradas: hora del día, día de la semana, fin de semana, festivo, temperatura, humedad, viento, lluvia, lluvia de las 2 horas previas y tipo de clima) y produce g0 y G una sola vez por intervalo.
Cada estación aporta su sesgo b y 24 factores U, a partir de un embedding libre, un embedding de su barrio y sus coordenadas. La parte del barrio es lo que permite pronosticar estaciones nuevas sin historia.
Cada celda cuesta un producto punto, así que entrenar toma unos 6 minutos en 8 núcleos de CPU.
La verosimilitud es binomial negativa: varianza = mu + alpha * mu^2, con la dispersión según la tasa, el objetivo y la estación. Da el mismo pronóstico puntual que Poisson, pero un intervalo mucho más realista.
Entrenamos con ruido en el clima, promedio móvil exponencial de los pesos y calendario coseno.
Intervalos calibrados: parte del ruido es independiente entre celdas y parte es compartida (el clima de un día, un evento en un barrio, una estación fuera de servicio). Cinco choques compartidos, ajustados en cinco folds, hacen que los intervalos de totales por barrio no queden demasiado angostos.
Se exporta a ONNX (1.2 MB) y el dashboard lo ejecuta con `onnxruntime-node`.
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

# Cómo lo construimos

<div class="grid grid-cols-3 gap-6 mt-10 text-left">
<div class="card">

### Datos
12 meses de viajes, barrios NTA y clima por hora.

</div>
<div class="card">

### Modelo
Iteramos varias versiones hasta una red factorizada, validada en el tiempo.

</div>
<div class="card">

### Dashboard
Modelo ONNX con pronóstico de clima en vivo.

</div>
</div>

<div class="grid grid-cols-3 gap-6 mt-8">
<div class="card"><div class="big">21%</div>de error por estación-día</div>
<div class="card"><div class="big">2,515</div>estaciones pronosticadas cada 15 min</div>
<div class="card"><div class="big">84%</div>de cobertura del intervalo de 80%</div>
</div>

<!--
(2:15–3:00) Todo reproducible desde los CSV crudos, con semilla fija.
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
