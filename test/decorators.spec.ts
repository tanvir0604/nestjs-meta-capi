import { jest } from '@jest/globals';

import { MetaDataset } from '../src/decorators/meta-dataset.decorator';
import { META_DATASET_METADATA } from '../src/decorators/meta-dataset.decorator';
import { MetaEvent } from '../src/decorators/meta-event.decorator';
import { META_EVENT_METADATA } from '../src/decorators/meta-event.decorator';

describe('@MetaEvent', () => {
  it('attaches options to the handler as Reflect metadata', () => {
    class Controller {
      handler(): string {
        return 'ok';
      }
    }

    const descriptor = Object.getOwnPropertyDescriptor(Controller.prototype, 'handler');
    if (descriptor === undefined) {
      throw new Error('descriptor missing');
    }

    MetaEvent({ name: 'Lead', eventId: 'id' })(Controller.prototype, 'handler', descriptor);

    expect(Reflect.getMetadata(META_EVENT_METADATA, Controller.prototype.handler)).toEqual({
      name: 'Lead',
      eventId: 'id',
    });
  });

  it('throws when applied to something that is not a method', () => {
    expect(() => MetaEvent({ name: 'Lead' })({}, 'x', {} as PropertyDescriptor)).toThrow(
      'can only be applied to a method',
    );
  });

  it('performs no I/O at decoration time (invariant 2)', () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    class Controller {
      handler(): void {
        /* no-op */
      }
    }

    MetaEvent({ name: 'Lead' })(Controller.prototype, 'handler', {
      value: Controller.prototype.handler,
    } as PropertyDescriptor);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('@MetaDataset', () => {
  it('attaches a dataset name to a controller', () => {
    class Controller {}

    MetaDataset('marketing')(Controller);

    expect(Reflect.getMetadata(META_DATASET_METADATA, Controller)).toBe('marketing');
  });

  it('attaches a dataset name to a single method', () => {
    class Controller {
      handler(): void {
        /* no-op */
      }
    }

    MetaDataset('primary')(Controller.prototype, 'handler', {
      value: Controller.prototype.handler,
    } as PropertyDescriptor);

    expect(Reflect.getMetadata(META_DATASET_METADATA, Controller.prototype.handler)).toBe(
      'primary',
    );
  });
});
