import { Plugin } from 'obsidian';

export default class SVGColorReplacerPlugin extends Plugin {
    private readonly PROCESSED_MARKER = 'svg-color-replaced';
    private intersectionObserver: IntersectionObserver | null = null;

    onload() {
        // Инициализируем Intersection Observer для отслеживания видимых SVG
        this.setupIntersectionObserver();

        // Обработка SVG после рендеринга LaTeX
        this.registerMarkdownPostProcessor((element, context) => {
            this.processSVGElements(element);
        });

        // Обработка динамически добавляемых SVG
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.processAllSVG();
            })
        );

        // Обработка SVG при прокрутке (debounced)
        this.registerDomEvent(document, 'scroll', this.debounce(() => {
            this.processVisibleSVG();
        }, 150), true);
    }

    setupIntersectionObserver() {
        // Создаем observer для отслеживания появления SVG в viewport
        this.intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const element = entry.target;
                    
                    if (element.tagName.toLowerCase() === 'svg' && !element.hasAttribute(this.PROCESSED_MARKER)) {
                        this.replaceSVGColors(element as SVGElement);
                        (element as SVGElement).setAttribute(this.PROCESSED_MARKER, 'true');
                    } else if (element.tagName.toLowerCase() === 'img' && !element.hasAttribute(this.PROCESSED_MARKER)) {
                        this.replaceImageSVGColors(element as HTMLImageElement);
                        element.setAttribute(this.PROCESSED_MARKER, 'true');
                    }
                }
            });
        }, {
            root: null, // viewport
            rootMargin: '50px', // Обрабатываем за 50px до появления
            threshold: 0.01 // Триггер при 1% видимости
        });
    }

    processSVGElements(container: HTMLElement) {
        // Находим все SVG элементы в контейнере
        const svgElements = container.querySelectorAll('svg');
        
        svgElements.forEach((svg) => {
            // Проверяем, не был ли элемент уже обработан
            if (!svg.hasAttribute(this.PROCESSED_MARKER)) {
                // Если observer активен, добавляем в наблюдение
                if (this.intersectionObserver) {
                    this.intersectionObserver.observe(svg);
                } else {
                    // Иначе обрабатываем сразу
                    this.replaceSVGColors(svg);
                    svg.setAttribute(this.PROCESSED_MARKER, 'true');
                }
            }
        });

        // Обработка SVG внутри img тегов (если LaTeX рендерится как изображение)
        const imgElements = container.querySelectorAll('img[src^="data:image/svg"]');
        imgElements.forEach((img) => {
            // Проверяем, не был ли элемент уже обработан
            if (!img.hasAttribute(this.PROCESSED_MARKER)) {
                if (this.intersectionObserver) {
                    this.intersectionObserver.observe(img);
                } else {
                    this.replaceImageSVGColors(img as HTMLImageElement);
                    img.setAttribute(this.PROCESSED_MARKER, 'true');
                }
            }
        });
    }

    processVisibleSVG() {
        // Обрабатываем SVG, которые еще не обработаны и находятся в viewport
        const contentElements = document.querySelectorAll('.markdown-preview-view');
        contentElements.forEach((container) => {
            this.processSVGElements(container as HTMLElement);
        });
    }

    debounce<T extends unknown[]>(func: (...args: T) => void, wait: number): (...args: T) => void {
        let timeout: NodeJS.Timeout;
        return (...args: T) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    replaceSVGColors(svg: SVGElement) {
        // Получаем цвет фона Obsidian
        const backgroundColor = this.getObsidianBackgroundColor();
        
        // Заменяем цвета во всех элементах SVG
        const allElements = svg.querySelectorAll('*');
        
        allElements.forEach((element) => {
            // Проверяем атрибут fill (используется для заливки и для текста в SVG)
            const fill = element.getAttribute('fill');
            if (fill) {
                if (this.isWhiteColor(fill)) {
                    // Белый -> Цвет фона
                    element.setAttribute('fill', backgroundColor);
                } else if (this.isBlackColor(fill)) {
                    // Черный -> Белый (включая текст)
                    element.setAttribute('fill', 'white');
                }
            } else {
                // Если fill не указан явно, для текстовых элементов устанавливаем белый
                const tagName = element.tagName.toLowerCase();
                if (tagName === 'text' || tagName === 'tspan') {
                    element.setAttribute('fill', 'white');
                }
            }

            // Проверяем атрибут stroke
            const stroke = element.getAttribute('stroke');
            if (stroke) {
                if (this.isWhiteColor(stroke)) {
                    element.setAttribute('stroke', backgroundColor);
                } else if (this.isBlackColor(stroke)) {
                    element.setAttribute('stroke', 'white');
                }
            }

            // Проверяем атрибут color (для текста)
            const color = element.getAttribute('color');
            if (color) {
                if (this.isWhiteColor(color)) {
                    element.setAttribute('color', backgroundColor);
                } else if (this.isBlackColor(color)) {
                    element.setAttribute('color', 'white');
                }
            }

            // Проверяем style атрибут
            const style = element.getAttribute('style');
            if (style) {
                const newStyle = this.replaceColorsInStyle(style, backgroundColor);
                element.setAttribute('style', newStyle);
            }
        });

        // Обработка корневого SVG элемента
        const rootFill = svg.getAttribute('fill');
        if (rootFill) {
            if (this.isWhiteColor(rootFill)) {
                svg.setAttribute('fill', backgroundColor);
            } else if (this.isBlackColor(rootFill)) {
                svg.setAttribute('fill', 'white');
            }
        } else {
            // Если у корневого SVG нет fill, устанавливаем белый для текста по умолчанию
            svg.setAttribute('fill', 'white');
        }
    }

    replaceImageSVGColors(img: HTMLImageElement) {
        const src = img.src;
        if (!src.startsWith('data:image/svg+xml')) return;

        try {
            // Получаем цвет фона Obsidian
            const backgroundColor = this.getObsidianBackgroundColor();
            
            // Декодируем SVG из data URL
            const svgContent = decodeURIComponent(src.replace(/^data:image\/svg\+xml[^,]*,/, ''));
            
            // Заменяем цвета
            const modifiedSVG = this.replaceColorsInSVGString(svgContent, backgroundColor);
            
            // Создаем новый data URL
            const newSrc = 'data:image/svg+xml,' + encodeURIComponent(modifiedSVG);
            img.src = newSrc;
        } catch (e) {
            console.error('Error processing SVG image:', e);
        }
    }

    replaceColorsInSVGString(svgString: string, backgroundColor: string): string {
        let result = svgString;
        
        // Сначала заменяем белый -> цвет фона
        result = result
            .replace(/fill=["']#fff["']/gi, `fill="${backgroundColor}"`)
            .replace(/fill=["']#ffffff["']/gi, `fill="${backgroundColor}"`)
            .replace(/fill=["']white["']/gi, `fill="${backgroundColor}"`)
            .replace(/fill=["']rgb\(255,\s*255,\s*255\)["']/gi, `fill="${backgroundColor}"`)
            .replace(/stroke=["']#fff["']/gi, `stroke="${backgroundColor}"`)
            .replace(/stroke=["']#ffffff["']/gi, `stroke="${backgroundColor}"`)
            .replace(/stroke=["']white["']/gi, `stroke="${backgroundColor}"`)
            .replace(/color=["']#fff["']/gi, `color="${backgroundColor}"`)
            .replace(/color=["']#ffffff["']/gi, `color="${backgroundColor}"`)
            .replace(/color=["']white["']/gi, `color="${backgroundColor}"`)
            .replace(/fill:\s*#fff\b/gi, `fill: ${backgroundColor}`)
            .replace(/fill:\s*#ffffff\b/gi, `fill: ${backgroundColor}`)
            .replace(/fill:\s*white\b/gi, `fill: ${backgroundColor}`)
            .replace(/fill:\s*rgb\(255,\s*255,\s*255\)/gi, `fill: ${backgroundColor}`)
            .replace(/color:\s*#fff\b/gi, `color: ${backgroundColor}`)
            .replace(/color:\s*#ffffff\b/gi, `color: ${backgroundColor}`)
            .replace(/color:\s*white\b/gi, `color: ${backgroundColor}`)
            .replace(/color:\s*rgb\(255,\s*255,\s*255\)/gi, `color: ${backgroundColor}`);
        
        // Потом заменяем черный -> белый
        result = result
            .replace(/fill=["']#000["']/gi, 'fill="white"')
            .replace(/fill=["']#000000["']/gi, 'fill="white"')
            .replace(/fill=["']black["']/gi, 'fill="white"')
            .replace(/fill=["']rgb\(0,\s*0,\s*0\)["']/gi, 'fill="white"')
            .replace(/stroke=["']#000["']/gi, 'stroke="white"')
            .replace(/stroke=["']#000000["']/gi, 'stroke="white"')
            .replace(/stroke=["']black["']/gi, 'stroke="white"')
            .replace(/color=["']#000["']/gi, 'color="white"')
            .replace(/color=["']#000000["']/gi, 'color="white"')
            .replace(/color=["']black["']/gi, 'color="white"')
            .replace(/fill:\s*#000\b/gi, 'fill: white')
            .replace(/fill:\s*#000000\b/gi, 'fill: white')
            .replace(/fill:\s*black\b/gi, 'fill: white')
            .replace(/fill:\s*rgb\(0,\s*0,\s*0\)/gi, 'fill: white')
            .replace(/color:\s*#000\b/gi, 'color: white')
            .replace(/color:\s*#000000\b/gi, 'color: white')
            .replace(/color:\s*black\b/gi, 'color: white')
            .replace(/color:\s*rgb\(0,\s*0,\s*0\)/gi, 'color: white');
        
        return result;
    }

    getObsidianBackgroundColor(): string {
        // Получаем цвет фона из body или .app-container
        const bodyStyle = getComputedStyle(document.body);
        let backgroundColor = bodyStyle.backgroundColor;
        
        // Если фон прозрачный, пробуем получить из .app-container
        if (!backgroundColor || backgroundColor === 'rgba(0, 0, 0, 0)' || backgroundColor === 'transparent') {
            const appContainer = document.querySelector('.app-container');
            if (appContainer) {
                backgroundColor = getComputedStyle(appContainer).backgroundColor;
            }
        }
        
        // Если всё ещё не получили, используем дефолтный цвет
        if (!backgroundColor || backgroundColor === 'rgba(0, 0, 0, 0)' || backgroundColor === 'transparent') {
            // Проверяем, темная ли тема (по наличию класса theme-dark)
            const isDarkTheme = document.body.classList.contains('theme-dark');
            backgroundColor = isDarkTheme ? '#202020' : '#ffffff';
        }
        
        return backgroundColor;
    }

    isWhiteColor(color: string): boolean {
        const normalized = color.toLowerCase().trim();
        return normalized === '#fff' ||
               normalized === '#ffffff' ||
               normalized === 'white' ||
               normalized === 'rgb(255,255,255)' ||
               normalized === 'rgb(255, 255, 255)';
    }

    isBlackColor(color: string): boolean {
        const normalized = color.toLowerCase().trim();
        return normalized === '#000' ||
               normalized === '#000000' ||
               normalized === 'black' ||
               normalized === 'rgb(0,0,0)' ||
               normalized === 'rgb(0, 0, 0)';
    }

    replaceColorsInStyle(style: string, backgroundColor: string): string {
        let result = style;
        
        // Сначала белый -> цвет фона
        result = result
            .replace(/fill:\s*#fff\b/gi, `fill: ${backgroundColor}`)
            .replace(/fill:\s*#ffffff\b/gi, `fill: ${backgroundColor}`)
            .replace(/fill:\s*white\b/gi, `fill: ${backgroundColor}`)
            .replace(/fill:\s*rgb\(255,\s*255,\s*255\)/gi, `fill: ${backgroundColor}`)
            .replace(/stroke:\s*#fff\b/gi, `stroke: ${backgroundColor}`)
            .replace(/stroke:\s*#ffffff\b/gi, `stroke: ${backgroundColor}`)
            .replace(/stroke:\s*white\b/gi, `stroke: ${backgroundColor}`)
            .replace(/color:\s*#fff\b/gi, `color: ${backgroundColor}`)
            .replace(/color:\s*#ffffff\b/gi, `color: ${backgroundColor}`)
            .replace(/color:\s*white\b/gi, `color: ${backgroundColor}`)
            .replace(/color:\s*rgb\(255,\s*255,\s*255\)/gi, `color: ${backgroundColor}`);
        
        // Потом черный -> белый
        result = result
            .replace(/fill:\s*#000\b/gi, 'fill: white')
            .replace(/fill:\s*#000000\b/gi, 'fill: white')
            .replace(/fill:\s*black\b/gi, 'fill: white')
            .replace(/fill:\s*rgb\(0,\s*0,\s*0\)/gi, 'fill: white')
            .replace(/stroke:\s*#000\b/gi, 'stroke: white')
            .replace(/stroke:\s*#000000\b/gi, 'stroke: white')
            .replace(/stroke:\s*black\b/gi, 'stroke: white')
            .replace(/color:\s*#000\b/gi, 'color: white')
            .replace(/color:\s*#000000\b/gi, 'color: white')
            .replace(/color:\s*black\b/gi, 'color: white')
            .replace(/color:\s*rgb\(0,\s*0,\s*0\)/gi, 'color: white');
        
        return result;
    }

    processAllSVG() {
        const contentElements = document.querySelectorAll('.markdown-preview-view');
        contentElements.forEach((element) => {
            this.processSVGElements(element as HTMLElement);
        });
    }

    onunload() {        
        // Очищаем observer при выгрузке плагина
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
            this.intersectionObserver = null;
        }
    }
}